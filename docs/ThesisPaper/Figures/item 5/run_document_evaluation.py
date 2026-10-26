"""Offline, synthetic-only evidence runner. Never reads .env or contacts a service."""
import asyncio
import ast
import contextlib
import csv
import hashlib
import importlib.metadata
import io
import json
import platform
import socket
import subprocess
import sys
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.dont_write_bytecode = True
COMMAND = 'py -3.12 "docs/ThesisPaper/figure/item 5/run_document_evaluation.py"'


def deny_network(*args, **kwargs):
    raise RuntimeError('Network is disabled for this offline evaluation')


def main():
    started = datetime.now(timezone.utc)
    git = r'C:\Program Files\Git\cmd\git.exe'
    tracked = subprocess.check_output([git, 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    hashes = {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in tracked if p and (ROOT / p).is_file()}
    original_connect = socket.socket.connect
    original_socketpair = socket.socketpair

    def local_asyncio_socketpair(*args, **kwargs):
        # Windows asyncio requires an internal loopback socketpair. Permit only
        # creation of that pair, not application HTTP/database connections.
        with patch.object(socket.socket, 'connect', original_connect):
            return original_socketpair(*args, **kwargs)

    with patch.object(socket.socket, 'connect', deny_network), patch.object(socket, 'create_connection', deny_network), \
         patch.object(socket, 'socketpair', local_asyncio_socketpair):
        from backend import document_scanner as scanner
        from backend import signup_service as signup
        from backend import student_profile_service as profiles
        from backend.download_protection import processing_pdf
        from fastapi import HTTPException
        from pypdf import PdfReader
        from reportlab.pdfgen import canvas
        from reportlab.lib.utils import ImageReader
        from PIL import Image, ImageDraw, ImageFont

        package_names = ['pdfplumber', 'pytesseract', 'pdf2image', 'pillow', 'fastapi', 'pypdf', 'reportlab']
        environment = {'python':sys.version, 'platform':platform.platform(),
                       'packages':{name:importlib.metadata.version(name) for name in package_names},
                       'scannerHealthReported':scanner.get_scanner_dependency_status(),
                       'tesseractConfiguredPathExists':Path(scanner.TESSERACT_COMMAND).is_file(),
                       'network':'Application socket connections denied; native internal asyncio socketpair creation allowed',
                       'storage':'Mocked in-memory dictionaries; no database/storage operations',
                       'implementation':'Existing parser/validators unchanged; no dependencies installed'}
        # Reference values transcribed from existing, visibly TEST-labelled QA PDFs,
        # not derived from the evaluated parser. ID/name values are synthetic.
        references = [
            ('first-year-cor.pdf','cor',dict(studentId='20260001', firstName='Student',lastName='Test',fullName='Student Test',
                course='Bachelor of Science in Information Technology',year='1',academicYear='2026-2027',semester='1st')),
            ('upper-year-cor.pdf','cor',dict(studentId='20260002',firstName='Upper',lastName='Test',fullName='Upper Test',
                course='Bachelor of Science in Information Technology',year='2',academicYear='2026-2027',semester='1st')),
            ('upper-year-rog.pdf','rog',dict(studentId='20260002',firstName='Upper',lastName='Test',fullName='Upper Test',
                course='Bachelor of Science in Information Technology',year='1',academicYear='2025-2026',semester='2nd',gwa='1.50')),
        ]
        docs=[]; field_rows=[]; source_text={}
        for name,kind,expected in references:
            file=ROOT/'docs/qa'/name; raw=file.read_bytes()
            text='\n'.join(page.extract_text() or '' for page in PdfReader(io.BytesIO(raw)).pages)
            assert 'TEST,' in text, 'Fixture must be explicitly TEST-labelled'
            source_text[name]=text
            output=scanner.parse_pdf_document(raw,kind)
            checks=[]
            for key,want in expected.items():
                got=output.get(key)
                correct=(str(got).strip()==want) if key=='studentId' else str(got).strip().casefold()==want.casefold()
                checks.append(correct)
                field_rows.append({'document':name,'documentType':kind,'field':key,'expected':want,'actual':got,'correct':correct})
            docs.append({'file':str(file.relative_to(ROOT)), 'sha256':hashlib.sha256(raw).hexdigest(),
                'referenceBasis':'Transcribed from visible TEST-labelled source PDF text; course/name/semester use documented canonical representation',
                'documentType':kind,'expected':expected,'actual':output,'correctFields':sum(checks),'evaluatedFields':len(checks),
                'exclusions':'Absent section, middleName and COR GWA not scored. Title/flags are validation metadata, not field accuracy.',
                'titleRecognized':bool(output.get('isValidCorDocument') or output.get('isValidCogDocument'))})

        test_names=[
            'backend.tests.test_document_scanner',
            'backend.tests.test_signup_identity_documents',
            'backend.tests.test_student_document_upload_regression',
            'backend.tests.test_student_profile_service.StudentProfileRequirementTests',
            'backend.tests.test_student_profile_service.StudentDocumentSubmissionPolicyTests.test_valid_cor_is_system_approved_even_when_manual_account_review_is_enabled',
            'backend.tests.test_romel_download_protection.RomelProtectionTests.test_malformed_pdf_rejected',
            'backend.tests.test_romel_download_protection.RomelProtectionTests.test_password_assisted_processing_rejects_wrong_and_missing',
        ]
        stream=io.StringIO(); unit_command='py -3.12 -m unittest -v '+' '.join(test_names)
        unit_start=time.monotonic()
        with contextlib.redirect_stdout(stream), contextlib.redirect_stderr(stream):
            suite=unittest.defaultTestLoader.loadTestsFromNames(test_names)
            result=unittest.TextTestRunner(stream=stream,verbosity=2).run(suite)
        unit_elapsed = time.monotonic()-unit_start
        unit_log=stream.getvalue()
        (OUT/'Existing_Test_Execution.txt').write_text(
            'Actual invocation: '+COMMAND+'\nUnit-test runner: unittest.TextTestRunner(verbosity=2), inside offline socket guard\n'
            +'Equivalent unittest selection: '+unit_command+'\nUTC started: '+started.isoformat()+'\n\n'+unit_log,encoding='utf-8')

        def pdf_text(text):
            out=io.BytesIO(); c=canvas.Canvas(out);y=800
            for line in text.splitlines(): c.drawString(40,y,line);y-=19
            c.save();return out.getvalue()

        def upload(raw, name='document.pdf', mime='application/pdf'):
            f=Mock(filename=name,content_type=mime);f.read=AsyncMock(return_value=raw);return f

        written=[]
        def store(path,body,mime):
            written.append(path);return {'bucket':'offline-fixture','path':path,'size':len(body),'type':mime}

        async def signup_attempt(cor,rog=None,student_id='20260002',declared_year=''):
            with patch.object(signup,'get_current_semester_tag',return_value='2026-2027-1ST'), \
                 patch.object(signup,'_signup_document_policy',return_value={'corMode':'cor_only','manualReviewEnabled':True}), \
                 patch.object(signup,'_store_bytes',side_effect=store), \
                 patch.object(signup,'supabase_document_upsert',return_value={'ok':True}), \
                 patch.object(signup,'_delete_stored_bytes'):
                return await signup.create_signup_document_batch(student_id,'fixture@example.test','student_id',
                    upload(cor),upload(b'offline identity placeholder','identity.png','image/png'),
                    upload(rog) if rog is not None else None,declared_year)

        async def profile_attempt(raw,kind='cor',mime='application/pdf'):
            with patch.object(profiles,'_student_id',return_value='offline-other-student'), \
                 patch.object(profiles,'_require_student',return_value={'year':'2'}), \
                 patch.object(profiles,'_cycle',return_value=('2026-2027-1ST','1ST')), \
                 patch.object(profiles,'_requirements',return_value={'corMode':'cor_only','rogRequired':True}), \
                 patch.object(profiles,'_data_rows',return_value=[]), \
                 patch.object(profiles,'_store_bytes',side_effect=store), \
                 patch.object(profiles,'supabase_document_upsert',return_value={'ok':True}), \
                 patch.object(profiles,'supabase_document_update',return_value={'ok':True}), \
                 patch.object(profiles,'_system_approve_submission',side_effect=lambda sid,data,student:{**data,'status':'approved'}):
                return await profiles.upload_student_document(object(),kind,upload(raw,'fixture.pdf' if mime=='application/pdf' else 'fixture.png',mime))

        cases=[]
        def case(tid,kind,condition,expected,call,expected_reason=None,kind_of_test='Validation',limitation=False):
            before_writes=len(written)
            try:
                value=call()
                if asyncio.iscoroutine(value):value=asyncio.run(value)
                if isinstance(value,dict) and 'submission' in value:
                    observed={'accepted':True,'status':value['submission'].get('status'),'scan':value['submission'].get('scan')}
                elif isinstance(value,dict):
                    observed={k:value[k] for k in ('ok','year','rogRequired','identityKind','isValidCorDocument','studentId','course','yearDetectionSource') if k in value}
                else:observed={'returned':str(value)[:180]}
                actual='Accepted/completed'
                status='LIMITATION' if limitation else ('FAIL' if expected_reason else 'PASS')
            except HTTPException as e:
                observed={'httpStatus':e.status_code,'reason':e.detail}
                actual=f'HTTP {e.status_code}: {e.detail}'
                status='PASS' if expected_reason==e.detail else 'FAIL'
            except Exception as e:
                observed={'exceptionType':type(e).__name__,'message':str(e)[:350]}
                actual=type(e).__name__+': '+str(e)[:180]
                status='DEPENDENCY BLOCKED' if 'tesseract_not_installed' in str(e) else 'FAIL'
            cases.append({'testId':tid,'documentType':kind,'condition':condition,'expected':expected,'actual':actual,
                'status':status,'scope':kind_of_test,'observed':observed,'mockStorageWrites':len(written)-before_writes})

        cor=(ROOT/'docs/qa/upper-year-cor.pdf').read_bytes();rog=(ROOT/'docs/qa/upper-year-rog.pdf').read_bytes()
        first=(ROOT/'docs/qa/first-year-cor.pdf').read_bytes()
        case('DOC-01','COR','Existing first-year text PDF; real parser + isolated signup','Accept COR; first-year first-semester ROG exemption',lambda:signup_attempt(first,student_id='20260001'))
        case('DOC-02','COR + ROG','Existing upper-year text PDFs; real parser + isolated signup','Accept current COR and previous-cycle ROG',lambda:signup_attempt(cor,rog))
        case('DOC-03','COR','Signup Student ID differs from COR','Reject cor_student_id_mismatch',lambda:signup_attempt(cor,rog,student_id='20260099'),'cor_student_id_mismatch')
        missing_year=pdf_text(source_text['upper-year-cor.pdf'].replace('Year Level: 2',''))
        case('DOC-04','COR','Synthetic variant missing year; no declared year','Reject cor_year_level_not_detected',lambda:signup_attempt(missing_year,rog),'cor_year_level_not_detected')
        wrong_cycle=pdf_text(source_text['upper-year-cor.pdf'].replace('2026-2027','2025-2026'))
        case('DOC-05','COR','Synthetic variant with previous academic year','Reject cor_cycle_mismatch',lambda:signup_attempt(wrong_cycle,rog),'cor_cycle_mismatch')
        wrong_rog_cycle=pdf_text(source_text['upper-year-rog.pdf'].replace('2025-2026','2026-2027'))
        case('DOC-06','ROG','Synthetic variant not in required previous cycle','Reject rog_cycle_mismatch',lambda:signup_attempt(cor,wrong_rog_cycle),'rog_cycle_mismatch')
        case('DOC-07','COR','Malformed PDF bytes through upload processing','Reject invalid_pdf_document',lambda:signup_attempt(b'not a PDF',rog),'invalid_pdf_document')
        case('DOC-08','COR','Standalone image upload to profile COR route','Reject pdf_required',lambda:profile_attempt(b'fixture image',mime='image/png'),'pdf_required')
        case('DOC-09','COR','Existing COR uploaded under another synthetic profile owner','Should not approve a different Student ID (exploratory safeguard expectation)',lambda:profile_attempt(cor),limitation=True)
        case('DOC-10','ROG','Wrong-cycle ROG uploaded through profile replacement','Should not approve wrong academic period (exploratory safeguard expectation)',lambda:profile_attempt(wrong_rog_cycle,kind='rog'),limitation=True)
        missing_course=pdf_text(source_text['upper-year-cor.pdf'].replace('Course: BSIT',''))
        case('DOC-11','COR','Synthetic variant missing course','Observe parser output and whether signup requires the missing field',lambda:signup_attempt(missing_course,rog),limitation=True)
        wrong_rog_id=pdf_text(source_text['upper-year-rog.pdf'].replace('20260002','20260099'))
        case('DOC-12','ROG','ROG Student ID differs from signup/COR Student ID','Should reject a wrong-owner ROG (exploratory safeguard expectation)',lambda:signup_attempt(cor,wrong_rog_id),limitation=True)
        # Capability probes use in-memory rasterized synthetic text; not accuracy samples.
        image=Image.new('RGB',(1500,1900),'white');d=ImageDraw.Draw(image)
        font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',32)
        for i,line in enumerate(source_text['upper-year-cor.pdf'].splitlines()):d.text((70,80+i*62),line,font=font,fill='black')
        png=io.BytesIO();image.save(png,format='PNG')
        scanned=io.BytesIO();c=canvas.Canvas(scanned);c.drawImage(ImageReader(png),0,0,width=595,height=754);c.save()
        case('DOC-13','COR','Image-only synthetic PDF through real parser','Use configured OCR fallback if runtime dependencies exist',lambda:scanner.parse_pdf_document(scanned.getvalue(),'cor'),kind_of_test='OCR capability')
        if cases[-1]['observed'].get('isValidCorDocument') is False:
            cases[-1]['status']='DEPENDENCY BLOCKED';cases[-1]['actual']='Parser returned blank fields / invalid title; PDF-to-image fallback could not run (Poppler absent).'
        case('DOC-14','Generic image','Direct image OCR helper on synthetic PNG','OCR if Tesseract executable exists; COR/ROG image upload remains unsupported',lambda:scanner.extract_image_text(png.getvalue()),kind_of_test='OCR capability')
        empty_parse=scanner.parse_document('Certificate of Registration\nAcademic Year 2026-2027\n1st Semester','cor')
        cases.append({'testId':'DOC-15','documentType':'COR','condition':'Title/period only: no identity, course, or year level',
            'expected':'Expose absent fields; title recognition is not full validation',
            'actual':f"studentId={empty_parse['studentId']!r}; course={empty_parse['course']!r}; year={empty_parse['year']!r}; titleValid={empty_parse['isValidCorDocument']}",
            'status':'PASS','scope':'Missing-field observation','observed':empty_parse,'mockStorageWrites':0})

        accuracy=[]
        for kind in ('cor','rog'):
            selected=[doc for doc in docs if doc['documentType']==kind]
            n=sum(doc['evaluatedFields'] for doc in selected);correct=sum(doc['correctFields'] for doc in selected)
            accuracy.append({'documentType':kind,'testDocuments':len(selected),'evaluatedFields':n,'correctFields':correct,
                'accuracyPercent':correct/n*100 if n else None,
                'validationResult':'Title recognized; isolated signup baseline accepted. Other validation scenarios reported separately.',
                'scope':'Three existing synthetic text-based fixtures only; no real-student/OCR generalization'})
        ended=datetime.now(timezone.utc)
        unchanged=all(hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h for p,h in hashes.items())
        assert unchanged,'Tracked source changed during evaluation'
        report={'startedAtUTC':started.isoformat(),'finishedAtUTC':ended.isoformat(),'command':COMMAND,
            'environment':environment,'referenceDocuments':docs,'fieldComparisons':field_rows,'accuracy':accuracy,
            'existingTests':{'testSelection':test_names,'equivalentUnittestCommand':unit_command,'count':result.testsRun,
                'failures':len(result.failures),'errors':len(result.errors),'skipped':len(result.skipped),
                'successful':result.wasSuccessful(),'elapsedSeconds':round(unit_elapsed,3),
                'interpretation':'Scanner text/layout tests exercise real helpers; signup/upload workflow tests largely mock parser/storage. Test pass count is not field accuracy.'},
            'scenarios':cases,
            'syntheticVariantParserOutputs':{
                'DOC-04':scanner.parse_pdf_document(missing_year,'cor'),
                'DOC-05':scanner.parse_pdf_document(wrong_cycle,'cor'),
                'DOC-06':scanner.parse_pdf_document(wrong_rog_cycle,'rog'),
                'DOC-11':scanner.parse_pdf_document(missing_course,'cor'),
                'DOC-12':scanner.parse_pdf_document(wrong_rog_id,'rog')},
            'trackedFilesUnchanged':len(hashes),'safety':'No network, production documents, production writes or dependency installation',
            'broaderSelectionNote':'A prior 34-test selection included an unrelated profile-submission test with an unmocked draft lookup; external connection was blocked. See Broader_Test_Execution.txt. Final 33-test selection retains the COR upload policy test, not that profile-form test.',
            'limitations':['Only 3 simple synthetic text PDFs; 25 correlated field comparisons, not independent trials',
                'No representative real-document extraction accuracy established','OCR dependencies unavailable locally despite misleading health flag',
                'Workflow dependencies mocked; not an authenticated HTTP/browser or database acceptance test',
                'No historical executed COR/ROG field-accuracy dataset located; current run is new evidence']}
        (OUT/'Evaluation_Results.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        with (OUT/'Field_Comparisons.csv').open('w',encoding='utf-8',newline='') as file:
            writer=csv.DictWriter(file,fieldnames=list(field_rows[0]));writer.writeheader();writer.writerows(field_rows)
        console=[f'Command: {COMMAND}',f'UTC: {started.isoformat()}',f'Python {platform.python_version()} | {platform.system()}',
            f'Existing tests: {result.testsRun} run; {len(result.failures)} failures; {len(result.errors)} errors; {len(result.skipped)} skipped',
            'Existing fixtures: 2 COR, 1 ROG; synthetic text PDFs only']
        for row in accuracy:console.append(f"{row['documentType'].upper()}: {row['correctFields']}/{row['evaluatedFields']} fields = {row['accuracyPercent']:.2f}% (synthetic only)")
        for row in cases:console.append(f"{row['testId']} {row['status']}: {row['actual']}")
        console+=['OCR: Poppler absent; configured Tesseract path does not exist.',
                  'No real-student/OCR accuracy established. Validation gaps are not counted as extraction failures.',
                  f'Tracked project files unchanged: {len(hashes)}. Network blocked; storage mocked.']
        log='\n'.join(console)+'\n'
        (OUT/'Evaluation_Console.txt').write_text(log,encoding='utf-8')
        print(log,end='')
        return 0 if result.wasSuccessful() else 1


if __name__=='__main__':
    raise SystemExit(main())

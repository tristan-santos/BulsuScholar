"""Reproduce synthetic algorithm evidence offline; never change application code."""
import ast
import contextlib
import csv
import hashlib
import importlib.util
import io
import json
import platform
import socket
import subprocess
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT));sys.dont_write_bytecode=True
COMMAND='py -3.12 "docs/ThesisPaper/Algorithm_Metrics_Audit/run_metrics_audit.py"'

def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def safe_metrics(tp,fp,fn,tn):
    precision=tp/(tp+fp) if tp+fp else None
    recall=tp/(tp+fn) if tp+fn else None
    # Count form is equivalent to 2PR/(P+R) when P/R are defined.
    f1=2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else None
    return dict(precision=precision,recall=recall,f1=f1,
                accuracy=(tp+tn)/(tp+fp+fn+tn) if tp+fp+fn+tn else None)

def main():
    start=datetime.now(timezone.utc)
    git=r'C:\Program Files\Git\cmd\git.exe'
    files=subprocess.check_output([git,'ls-files','-z'],cwd=ROOT).decode().split('\0')
    before={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in files if p and (ROOT/p).is_file()}
    original_connect=socket.socket.connect;original_socketpair=socket.socketpair
    def deny(*args,**kwargs):raise RuntimeError('External network disabled by metrics audit')
    def local_pair(*args,**kwargs):
        with patch.object(socket.socket,'connect',original_connect):return original_socketpair(*args,**kwargs)
    with patch.object(socket.socket,'connect',deny),patch.object(socket,'create_connection',deny),patch.object(socket,'socketpair',local_pair):
        from backend import grantor_algorithms as alg
        evaluation=load(ROOT/'scripts/evaluate-solis-matching.py','existing_solis_evaluator')
        fixture_path=ROOT/'backend/tests/fixtures/solis_matching_cases.json'
        fixture=json.loads(fixture_path.read_text(encoding='utf-8-sig'))
        assert fixture['datasetKind']=='synthetic'
        weighted=evaluation.evaluate(fixture['cases'])
        counts=weighted['counts'];metrics=safe_metrics(counts['truePositive'],counts['falsePositive'],counts['falseNegative'],counts['trueNegative'])
        decisions=[]
        for index,pair in enumerate(fixture['cases'],1):
            result=alg.evaluate_scholar_duplicate(pair['candidate'],pair['existing'])
            classified=weighted['cases'][index-1]
            branch=('Exact normalized Student ID' if result['exactStudentId'] else
                'Exact contact + name >= .72' if (result['exactEmail'] or result['exactPhone']) and result['nameSimilarity']>=.72 else
                'Name >= .82 AND weighted score >= .84' if result['nameSimilarity']>=.82 and result['score']>=.84 else
                'No duplicate rule met')
            decisions.append({**classified,'recordA':pair['candidate'],'recordB':pair['existing'],'appliedRule':branch,
                'fields':result['fields'],'groundTruthBasis':'Pre-existing synthetic fixture expectedDuplicate label; author-assigned intent, not independently adjudicated real identity',
                'scope':'Combined backend pair decision; not standalone Levenshtein or award/conflict classification'})
        # Existing evaluator's zero-denominator policy is verified separately.
        zero_checks=[]
        for name,cases in [('empty',[]),('no predicted/actual positives',[fixture['cases'][8]])]:
            output=evaluation.evaluate(cases)
            zero_checks.append({'case':name,'counts':output['counts'],'precision':output['precision'],'recall':output['recall'],'accuracy':output['accuracy']})
        assert safe_metrics(0,0,0,0)==dict(precision=None,recall=None,f1=None,accuracy=None)
        assert zero_checks[0]['precision'] is None and zero_checks[0]['recall'] is None
        (OUT/'Weighted_Matching_Execution.json').write_text(json.dumps({'executionUTC':start.isoformat(),
            'actualInvocation':COMMAND,'function':'scripts/evaluate-solis-matching.py:evaluate',
            'equivalentCLI':'py -3.12 scripts/evaluate-solis-matching.py --output docs/ThesisPaper/Algorithm_Metrics_Audit/Weighted_Matching_CLI.json',
            'datasetKind':'synthetic','fixtureSha256':hashlib.sha256(fixture_path.read_bytes()).hexdigest(),
            'positiveClass':'Same synthetic identity according to the pre-existing fixture label',
            'existingEvaluatorOutput':weighted,'auditDerivedMetrics':metrics,'zeroDenominatorChecks':zero_checks,
            'decisions':decisions},indent=2),encoding='utf-8')
        with (OUT/'Table_C_Matching_Decisions.csv').open('w',encoding='utf-8',newline='') as f:
            headers=['Test Case ID','Record A','Record B','Verified Ground Truth','Name Similarity','Weighted Similarity','Applied Threshold/Rule','System Decision','Classification']
            w=csv.writer(f);w.writerow(headers)
            for row in decisions:w.writerow([row['caseId'],json.dumps(row['recordA']),json.dumps(row['recordB']),str(row['expectedDuplicate'])+' (synthetic fixture label)',
                row['nameSimilarity'],row['weightedScore'],row['appliedRule'],row['actualDuplicate'],row['classification']])
        # New execution of existing synthetic document evaluation, redirected to a
        # fresh evidence folder. Historical evidence and helper source stay intact.
        doc_dir=OUT/'Document_Reexecution';doc_dir.mkdir(exist_ok=True)
        doc_runner=load(ROOT/'docs/ThesisPaper/Figures/item 5/run_document_evaluation.py','existing_document_evaluator')
        doc_runner.OUT=doc_dir;doc_runner.COMMAND=COMMAND+' [document-evaluator phase; output redirected]'
        stream=io.StringIO()
        with contextlib.redirect_stdout(stream),contextlib.redirect_stderr(stream):doc_return=doc_runner.main()
        (OUT/'Document_Execution_Console.txt').write_text(stream.getvalue(),encoding='utf-8')

        selection=['backend.tests.test_solis_system_revision','backend.tests.test_roster_workflow_service']
        log=io.StringIO();executed=[]
        class RecordedResult(unittest.TextTestResult):
            def addSuccess(self,test):super().addSuccess(test);executed.append({'testId':test.id(),'status':'Pass'})
            def addFailure(self,test,error):super().addFailure(test,error);executed.append({'testId':test.id(),'status':'Fail','reason':self._exc_info_to_string(error,test)})
            def addError(self,test,error):super().addError(test,error);executed.append({'testId':test.id(),'status':'Error','reason':self._exc_info_to_string(error,test)})
            def addSkip(self,test,reason):super().addSkip(test,reason);executed.append({'testId':test.id(),'status':'Skipped','reason':reason})
        with contextlib.redirect_stdout(log),contextlib.redirect_stderr(log):
            result=unittest.TextTestRunner(stream=log,verbosity=2,resultclass=RecordedResult).run(unittest.defaultTestLoader.loadTestsFromNames(selection))
        (OUT/'Matching_Regression_Execution.txt').write_text('Actual command: '+COMMAND+'\nEquivalent selection (requires same offline guard): py -3.12 -m unittest -v '+' '.join(selection)+'\nUTC: '+start.isoformat()+'\n\n'+log.getvalue(),encoding='utf-8')
        for row in executed:
            module,class_name,method=row['testId'].rsplit('.',2)
            source=ROOT/(module.replace('.','/')+'.py');text=source.read_text(encoding='utf-8-sig');tree=ast.parse(text)
            cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name==class_name)
            fn=next(n for n in cls.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name==method)
            row.update(source=str(source.relative_to(ROOT)),function=method,lineStart=min([fn.lineno]+[d.lineno for d in fn.decorator_list]),lineEnd=fn.end_lineno,
                inputAndExpectedEvidence=ast.get_source_segment(text,fn),
                groundTruth='Software contract assertions/synthetic mocked fixture; not an independently labeled real-identity or scholarship-conflict population case',
                metricUse='Regression result only; not automatically TP/FP/FN/TN')
        (OUT/'Matching_Regression_Results.json').write_text(json.dumps(executed,indent=2),encoding='utf-8')
        # A true worked example uses MATCH-004, a pre-existing positive fixture.
        sample=fixture['cases'][3]
        a=alg.normalize_match_value(sample['candidate']['fullName']);b=alg.normalize_match_value(sample['existing']['fullName'])
        normalized_email=alg.normalize_identifier(sample['candidate']['email'])
        worked={'caseId':'MATCH-004','recordA':sample['candidate'],'recordB':sample['existing'],
            'normalizedNameA':a,'normalizedNameB':b,'normalizedEmail':normalized_email,
            'nameLengthA':len(a),'nameLengthB':len(b),'editDistance':round((1-alg.levenshtein_similarity(a,b))*max(len(a),len(b))),
            'directSimilarity':alg.levenshtein_similarity(a,b),
            'tokenSortedSimilarity':alg.levenshtein_similarity(alg.token_sorted_value(a),alg.token_sorted_value(b)),
            'actualResult':alg.evaluate_scholar_duplicate(sample['candidate'],sample['existing']),
            'groundTruth':True,'groundTruthScope':'Pre-existing synthetic label; no real student identity verification performed',
            'classification':'truePositive'}
        (OUT/'Worked_Example.json').write_text(json.dumps(worked,indent=2),encoding='utf-8')
    assert all(hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h for p,h in before.items()),'Tracked existing file changed'
    env={'startedAtUTC':start.isoformat(),'finishedAtUTC':datetime.now(timezone.utc).isoformat(),'python':sys.version,
        'platform':platform.platform(),'command':COMMAND,'network':'External application connections blocked; internal asyncio socketpairs allowed',
        'groundTruthScope':'Existing synthetic labels; no verified real-student dataset/adjudication',
        'matchingRegressionTests':result.testsRun,'matchingRegressionFailures':len(result.failures),'matchingRegressionErrors':len(result.errors),
        'documentRunnerExitCode':doc_return,'trackedFilesUnchanged':len(before),
        'sourceSnapshotSha256':before,'productionWrites':False,'dependenciesInstalled':False}
    (OUT/'Execution_Environment.json').write_text(json.dumps(env,indent=2),encoding='utf-8')
    text='\n'.join([f'Command: {COMMAND}',f'UTC: {start.isoformat()}',f'Python: {platform.python_version()}',
        f'Weighted pair evaluator: TP={counts["truePositive"]}, FP={counts["falsePositive"]}, FN={counts["falseNegative"]}, TN={counts["trueNegative"]}',
        f'Precision={metrics["precision"]:.12f}; Recall={metrics["recall"]:.12f}; F1={metrics["f1"]:.12f}; Accuracy={metrics["accuracy"]:.12f}',
        'Scope: ten existing synthetic labeled pairs ONLY. F1 is audit-derived, not an existing production metric.',
        f'Matching/roster regressions: {result.testsRun}; failures={len(result.failures)}; errors={len(result.errors)}',
        f'Existing document evaluator exit code: {doc_return}; see fresh Document_Reexecution artifacts.',
        f'Unchanged tracked files verified: {len(before)}. No production access or new dependencies.'])+'\n'
    (OUT/'Execution_Console.txt').write_text(text,encoding='utf-8');print(text,end='')
    return 0 if result.wasSuccessful() and doc_return==0 else 1

if __name__=='__main__':raise SystemExit(main())

-- 1. Seed Grantors (Providers Table)
INSERT INTO providers (id, data) VALUES 
('grantor_tina', '{"providerName": "Cong. Tina Pancho", "providerType": "tina", "email": "grantor_tina@grantor.com", "role": "provider", "userType": "provider", "mustChangePassword": true, "password": "prI2LqRIzLQXvhVXYGS9XNku0Msvu2jDFe0Z4VbCc+R8SbiCRihM"}'),
('grantor_kuya_win', '{"providerName": "Kuya Win Scholarship Program", "providerType": "kuya_win", "email": "grantor_kuya_win@grantor.com", "role": "provider", "userType": "provider", "mustChangePassword": true, "password": "prI2LqRIzLQXvhVXYGS9XNku0Msvu2jDFe0Z4VbCc+R8SbiCRihM"}')
ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;

-- 2. Seed Grantor Portals (Grantor Portals Table)
INSERT INTO grantor_portals (id, data) VALUES 
('grantor_tina', '{"providerId": "grantor_tina", "providerName": "Cong. Tina Pancho", "providerType": "tina"}'),
('grantor_kuya_win', '{"providerId": "grantor_kuya_win", "providerName": "Kuya Win Scholarship Program", "providerType": "kuya_win"}')
ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;

-- 3. Seed 10 Students (Students Table)
INSERT INTO students (id, data) VALUES 
('20240001', '{"studentnumber": "20240001", "fname": "John", "lname": "Doe", "email": "john@email.com", "course": "BS Information Technology", "year": "1", "section": "A", "gwa": "1.25", "role": "student", "password": "NlhWn3QbKo9cMtaRg0BLgJtAoQyfl7m4G6OL3Hm5Uq1HG780wpB7"}'),
('20240002', '{"studentnumber": "20240002", "fname": "Jane", "lname": "Smith", "email": "jane@email.com", "course": "BS Information Technology", "year": "2", "section": "B", "gwa": "1.50", "role": "student", "password": "NlhWn3QbKo9cMtaRg0BLgJtAoQyfl7m4G6OL3Hm5Uq1HG780wpB7"}'),
('20240003', '{"studentnumber": "20240003", "fname": "Michael", "lname": "Brown", "email": "michael@email.com", "course": "BS Computer Engineering", "year": "1", "section": "C", "gwa": "1.75", "role": "student", "password": "NlhWn3QbKo9cMtaRg0BLgJtAoQyfl7m4G6OL3Hm5Uq1HG780wpB7"}'),
('20240004', '{"studentnumber": "20240004", "fname": "Emily", "lname": "Davis", "email": "emily@email.com", "course": "BS Industrial Technology", "year": "3", "section": "A", "gwa": "1.30", "role": "student", "password": "NlhWn3QbKo9cMtaRg0BLgJtAoQyfl7m4G6OL3Hm5Uq1HG780wpB7"}'),
('20240005', '{"studentnumber": "20240005", "fname": "David", "lname": "Wilson", "email": "david@email.com", "course": "BS Information Technology", "year": "4", "section": "D", "gwa": "1.45", "role": "student", "password": "NlhWn3QbKo9cMtaRg0BLgJtAoQyfl7m4G6OL3Hm5Uq1HG780wpB7"}'),
('20240006', '{"studentnumber": "20240006", "fname": "Sarah", "lname": "Johnson", "email": "sarah@email.com", "course": "BS Education", "year": "2", "section": "A", "gwa": "1.60", "role": "student", "password": "NlhWn3QbKo9cMtaRg0BLgJtAoQyfl7m4G6OL3Hm5Uq1HG780wpB7"}'),
('20240007', '{"studentnumber": "20240007", "fname": "Chris", "lname": "Lee", "email": "chris@email.com", "course": "BS Computer Engineering", "year": "3", "section": "B", "gwa": "1.85", "role": "student", "password": "NlhWn3QbKo9cMtaRg0BLgJtAoQyfl7m4G6OL3Hm5Uq1HG780wpB7"}'),
('20240008', '{"studentnumber": "20240008", "fname": "Anna", "lname": "Taylor", "email": "anna@email.com", "course": "BS Information Technology", "year": "1", "section": "E", "gwa": "1.15", "role": "student", "password": "NlhWn3QbKo9cMtaRg0BLgJtAoQyfl7m4G6OL3Hm5Uq1HG780wpB7"}'),
('20240009', '{"studentnumber": "20240009", "fname": "James", "lname": "Anderson", "email": "james@email.com", "course": "BS Industrial Technology", "year": "2", "section": "C", "gwa": "1.40", "role": "student", "password": "NlhWn3QbKo9cMtaRg0BLgJtAoQyfl7m4G6OL3Hm5Uq1HG780wpB7"}'),
('20240010', '{"studentnumber": "20240010", "fname": "Laura", "lname": "Thomas", "email": "laura@email.com", "course": "BS Education", "year": "4", "section": "B", "gwa": "1.55", "role": "student", "password": "NlhWn3QbKo9cMtaRg0BLgJtAoQyfl7m4G6OL3Hm5Uq1HG780wpB7"}')
ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;
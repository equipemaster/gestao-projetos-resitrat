-- Seed Data

-- Insert Users
INSERT INTO public.users (name, email, role, avatar_url, status) VALUES
('John Doe', 'john.doe@example.com', 'Product Manager', 'https://lh3.googleusercontent.com/aida-public/AB6AXuCHMTo50jmS6QlVNXS-Md-Xe6QIUXrHw2kUu3tkMgATs3j3vm-ZGjpuV4L5osSCAOkKDIMDxM8txxY7Nkeze7kQfpyHC5xO27IPc29NjlP4Z-LvO7SqCVi44PnGWgyWW2L2QVQpf3Ru3UkcgpADTiZ3b8RoIB5zRqlBzjOxdNuQ0du1ugJCU1pNUuqrT-kMak2p02BSv4rcTIe9IrFeXqRQwBptovohVipIzq8VNvBIRDDbU4NEJ_26qDpop06S6b_ay4iQwsBtcWA', 'Active'),
('Alice Johnson', 'alice.j@example.com', 'Lead Developer', 'https://lh3.googleusercontent.com/aida-public/AB6AXuAXX8Jln4KvDM4sLdAwPLMn7BFEPL8VcWlENosqrEuEtbztZAfI4xtfWwGJCOXtDOYViJ_wCWGkHBf94J0MDuspxltWifC4gzTkDm6DdMNP1iOTu6umfKlKLtfNjh8YCIrEwUb7QjV74ZGBLLHb2KcChsbyPFEj6U2fvig26axiE6K3tYhHjX-GWv6BLxXYuzGXTYqtI9LhWc1dEMIHPg6TxPkfSXrBF0LysQQy-tAu4a4cICNonsiHpblueowFc1BDK01s3tCzits', 'Active'),
('Bob Williams', 'bob.w@example.com', 'Designer', 'https://lh3.googleusercontent.com/aida-public/AB6AXuB56ADvHKaNKJQYuCDIu0hz1QvMVD0z3v4dqgpkNp0eDntqp3z9k4IBL0b9hpnMVq1Nbn2UIK_hrMn_f6-l2Jdg_q3QmTNdXz7ttHIROgiIx5uBCcGNf0uzECZhuiIZSOzrei2A0b-Obp3j5Hr2MhgbtaS0GZr-5zxdei064BbgZrgiITQZKRGZhwbdjTml5tZPUyDfajjxPRSHSyMjm1UENWtXANjtegADa02N0s9rTehOf_LlGmVXbvVs4I2rQ4sbtabd6VdWU84', 'Active'),
('Charlie Brown', 'charlie.b@example.com', 'Marketing', 'https://lh3.googleusercontent.com/aida-public/AB6AXuBc1VOw2ao6-AFZvsUXwXYgJb2Z5GyyXSFPKlCg2v_FvJMYJQfuhQqG2jHlKzUtpB6ecZiw-dgHOf9ULtq0Ucn5VFEJPNiGqN7uGAmo-q7soIroLVyZYGJwFqtUc8sooL5GkwiTvVw7kw7aHxLKbVWW6765V8QSkg6CkBb0zkzeF6ZTRXJYKiLMtTeRFR3WNDlY2uqROog5W48gEdmp7H4eRtBGk_wlGZ3SLAOqvm1xcQDk0rBqrevA-ffjkBUawWdOF0y36iBZ8BA', 'Active'),
('Diana Prince', 'diana.p@example.com', 'Backend Dev', 'https://lh3.googleusercontent.com/aida-public/AB6AXuDKVRFUkPgWA1NaoLhyJQGz-VgngqJVMpwSjX4Zbqkyj7TpVnKSfLgFMRXO3w662gJd6WdosAujL3sBmg4fVmMvl4GyZYdnmWSRJ5pcwtN4LNT5yU7FpmjGEiRLTqs47YGg985ie3mQBEn-pLy6pnVF9xVBUe9NCZgOgREIvNmNy8lxYZqOd3yI2-bwReXTRZSkWUd8k4K9od7u-VyJerlAGyTY1d2lRUf7PJZVBGMu1Qeu3uPTSNUy8OwiwIBZpwdeKydVPVqrA3I', 'Active');

-- Insert Projects (Using subqueries to get User IDs dynamically)
INSERT INTO public.projects (name, lead_id, due_date, progress, status, description) VALUES
('Website Redesign', (SELECT id FROM public.users WHERE name = 'Alice Johnson' LIMIT 1), '2024-12-15', 75, 'In Progress', 'Overhaul of the corporate website.'),
('Mobile App Launch', (SELECT id FROM public.users WHERE name = 'Bob Williams' LIMIT 1), '2024-11-30', 90, 'In Progress', 'Launch of the new iOS and Android apps.'),
('Q4 Marketing Campaign', (SELECT id FROM public.users WHERE name = 'Charlie Brown' LIMIT 1), '2024-10-20', 40, 'On Hold', 'End of year marketing push.'),
('API Integration', (SELECT id FROM public.users WHERE name = 'Diana Prince' LIMIT 1), '2025-01-10', 25, 'In Progress', 'Integrating third-party payment gateways.');

-- Insert Tasks
INSERT INTO public.tasks (title, project_id, assigned_to, due_date, status, ticket_id, priority) VALUES
('Implement user authentication flow', (SELECT id FROM public.projects WHERE name = 'Website Redesign' LIMIT 1), (SELECT id FROM public.users WHERE name = 'Alice Johnson' LIMIT 1), '2024-10-26', 'To Do', 'PROJ-123', 'High'),
('Design the new dashboard layout', (SELECT id FROM public.projects WHERE name = 'Website Redesign' LIMIT 1), (SELECT id FROM public.users WHERE name = 'Bob Williams' LIMIT 1), '2024-10-28', 'To Do', 'PROJ-124', 'Medium'),
('Setup CI/CD pipeline', (SELECT id FROM public.projects WHERE name = 'API Integration' LIMIT 1), (SELECT id FROM public.users WHERE name = 'Diana Prince' LIMIT 1), '2024-11-02', 'To Do', 'PROJ-125', 'Medium'),
('API endpoint development for user profiles', (SELECT id FROM public.projects WHERE name = 'API Integration' LIMIT 1), (SELECT id FROM public.users WHERE name = 'Diana Prince' LIMIT 1), '2024-10-25', 'In Progress', 'PROJ-118', 'Medium'),
('Fix login button bug on Safari', (SELECT id FROM public.projects WHERE name = 'Website Redesign' LIMIT 1), (SELECT id FROM public.users WHERE name = 'Alice Johnson' LIMIT 1), '2024-10-22', 'In Progress', 'PROJ-120', 'High'),
('Database schema design', (SELECT id FROM public.projects WHERE name = 'API Integration' LIMIT 1), (SELECT id FROM public.users WHERE name = 'Diana Prince' LIMIT 1), '2024-10-20', 'Done', 'PROJ-101', 'High');

-- Insert Activity Log
INSERT INTO public.activity_log (user_id, action, target, target_type) VALUES
((SELECT id FROM public.users WHERE name = 'Alice Johnson' LIMIT 1), 'completed', 'Design Mockups', 'Task'),
((SELECT id FROM public.users WHERE name = 'Bob Williams' LIMIT 1), 'commented on', 'App Store Screenshots', 'Task'),
((SELECT id FROM public.users WHERE name = 'Diana Prince' LIMIT 1), 'added a new task', 'API Integration', 'Project');

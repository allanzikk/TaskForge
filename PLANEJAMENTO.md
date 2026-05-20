# Planejamento

## Ideia
Sistema de projetos e tarefas para times.

## Entidades
- User
- Organization
- Project
- Task
- Comment
- Membership
- Invite

## Regras principais
- Um usuário pode criar organizações.
- Uma organização pode ter vários projetos.
- Um projeto pertence a uma organização.
- Uma task pertence a um projeto.
- Um usuário só pode ver dados de organizações das quais ele participa.
- Owner pode tudo.
- Admin pode gerenciar projetos e membros.
- Member pode criar e editar tarefas, mas não gerenciar membros.
- Apenas um convite por membro pode ser enviado a um usuário.




## Rotas iniciais

### Auth
- POST /signup
- POST /login

### Organizations
- POST /organizations
- GET /organizations
- GET /organizations/<id>
- DELETE /organizations/<id>

### Projects
- POST /organizations/<org_id>/projects
- GET /organizations/<org_id>/projects
- GET /projects/<project_id>

### Tasks
- POST /projects/<project_id>/tasks
- GET /projects/<project_id>/tasks
- PATCH /tasks/<task_id>
- DELETE /tasks/<task_id>


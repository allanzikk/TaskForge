const storageKeys = {
  token: "taskforge.token",
  user: "taskforge.user",
  apiBase: "taskforge.apiBase",
  selectedOrg: "taskforge.selectedOrg",
};

const defaultApiBase = window.location.protocol === "file:"
  ? "http://127.0.0.1:5000/api"
  : "/api";

const page = document.body.dataset.page || "redirect";
const appState = {
  token: localStorage.getItem(storageKeys.token) || "",
  user: readJson(storageKeys.user),
  organizations: [],
  currentOrgId: localStorage.getItem(storageKeys.selectedOrg) || "",
  organization: null,
  membership: null,
  projects: [],
  projectTaskMap: new Map(),
  tasks: [],
  invites: [],
  project: null,
  editingTaskId: "",
  editingMemberId: "",
};

init();

function init() {
  bindCommonControls();
  renderSessionLabels();

  const initializers = {
    redirect: initRedirect,
    login: initLogin,
    register: initRegister,
    dashboard: initDashboard,
    organization: initOrganizationPage,
    project: initProjectPage,
    task: initTaskPage,
  };

  (initializers[page] || initRedirect)();
}

function initRedirect() {
  goTo(appState.token ? "dashboard.html" : "login.html", true);
}

function initLogin() {
  if (appState.token) {
    goTo("dashboard.html", true);
    return;
  }

  $("#login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = $("#login-username").value.trim();
    const password = $("#login-password").value;

    if (!username || !password) {
      toast("Preencha usuário e senha.", "error");
      return;
    }

    await runWithStatus($("#login-submit"), async () => {
      const payload = await apiRequest("/login", {
        method: "POST",
        body: { username, password },
        skipAuth: true,
      });

      saveSession(readData(payload), username);
      toast("Sessão iniciada.", "success");
      goTo("dashboard.html");
    });
  });
}

function initRegister() {
  if (appState.token) {
    goTo("dashboard.html", true);
    return;
  }

  $("#register-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = $("#register-username").value.trim();
    const password = $("#register-password").value;

    if (!username || !password) {
      toast("Preencha usuário e senha.", "error");
      return;
    }

    await runWithStatus($("#register-submit"), async () => {
      await apiRequest("/create-account", {
        method: "POST",
        body: { username, password },
        skipAuth: true,
      });

      const payload = await apiRequest("/login", {
        method: "POST",
        body: { username, password },
        skipAuth: true,
      });

      saveSession(readData(payload), username);
      toast("Conta criada.", "success");
      goTo("dashboard.html");
    });
  });
}

function initDashboard() {
  if (!requireAuth()) return;

  $("#org-switcher")?.addEventListener("change", async (event) => {
    appState.currentOrgId = event.target.value;
    persistSelectedOrg();
    await runWithStatus(null, loadCurrentOrganizationOverview);
  });

  $("#create-org-form")?.addEventListener("submit", handleCreateOrganization);
  $("#global-search")?.addEventListener("input", renderDashboardOverview);
  runWithStatus(null, loadDashboard);
}

function initOrganizationPage() {
  if (!requireAuth()) return;

  $("#project-form")?.addEventListener("submit", handleCreateProject);
  $("#invite-search-btn")?.addEventListener("click", handleSearchUser);
  $("#invite-username-search")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSearchUser();
    }
  });
  $("#delete-org-button")?.addEventListener("click", handleDeleteOrganization);
  $("#member-edit-form")?.addEventListener("submit", handleEditMember);
  $("#member-edit-cancel")?.addEventListener("click", closeMemberEditDialog);
  $("#copy-org-id")?.addEventListener("click", () => {
    copyText(currentOrgIdFromPage(), "ID da organização copiado.");
  });

  runWithStatus(null, loadOrganizationPage);
}

function initProjectPage() {
  if (!requireAuth()) return;

  $("#task-form")?.addEventListener("submit", handleCreateTask);
  $("#copy-project-id")?.addEventListener("click", () => {
    copyText(getQueryParam("id"), "ID do projeto copiado.");
  });

  runWithStatus(null, loadProjectPage);
}

function initTaskPage() {
  if (!requireAuth()) return;

  $("#task-edit-form")?.addEventListener("submit", handleEditTask);
  $("#task-edit-cancel")?.addEventListener("click", closeTaskEditDialog);
  $("#edit-task-btn")?.addEventListener("click", () => openTaskEditDialog(appState.task));
  $("#complete-task-btn")?.addEventListener("click", () => handleCompleteTask(appState.task, $("#complete-task-btn")));
  $("#delete-task-btn")?.addEventListener("click", () => handleDeleteTask(appState.task));

  runWithStatus(null, loadTaskPage);
}

function bindCommonControls() {
  const apiBaseInput = $("#api-base-input");
  if (apiBaseInput) {
    apiBaseInput.value = getApiBase();
  }

  $("#save-api-base")?.addEventListener("click", () => {
    const nextBase = normalizeApiBase(apiBaseInput?.value);
    localStorage.setItem(storageKeys.apiBase, nextBase);
    if (apiBaseInput) apiBaseInput.value = nextBase;
    toast("Conexão salva.", "success");
  });

  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", logout);
  });

  document.querySelectorAll("[data-coming-soon]").forEach((button) => {
    button.addEventListener("click", () => {
      toast(`${button.dataset.comingSoon} ainda depende de rotas novas no servidor.`, "info");
    });
  });
}

async function loadDashboard() {
  setApiStatus("Sincronizando");
  const [orgsPayload, invitesPayload] = await Promise.all([
    apiRequest("/organizations"),
    apiRequest("/users/invites").catch((error) => {
      if (isAuthFailure(error)) throw error;
      return null;
    }),
  ]);

  appState.organizations = normalizeOrganizationsPayload(orgsPayload).map(normalizeOrganization);
  appState.invites = normalizeInvitesList(invitesPayload);
  chooseCurrentOrganization();
  renderOrgSwitcher();
  renderInvitesPanel(appState.invites);

  if (!appState.currentOrgId) {
    renderDashboardWithoutOrganization();
    setApiStatus("API pronta");
    return;
  }

  await loadCurrentOrganizationOverview();
}

async function loadCurrentOrganizationOverview() {
  if (!appState.currentOrgId) {
    renderDashboardWithoutOrganization();
    return;
  }

  setApiStatus("Sincronizando");
  const orgId = appState.currentOrgId;
  const orgSummary = appState.organizations.find((org) => org.id === orgId);
  const [orgResult, projectsResult] = await Promise.all([
    apiRequest(`/organizations/${encodeURIComponent(orgId)}`).catch((error) => {
      if (isAuthFailure(error)) throw error;
      return null;
    }),
    apiRequest(`/organizations/${encodeURIComponent(orgId)}/projects`).catch((error) => {
      if (isAuthFailure(error)) throw error;
      return null;
    }),
  ]);

  appState.organization = orgResult
    ? normalizeOrganizationDetail(orgResult, orgId)
    : fallbackOrganizationDetail(orgSummary, orgId);
  appState.membership = findCurrentMembership(appState.organization.members);
  appState.projects = normalizeList(projectsResult || appState.organization.projects).map(normalizeProject);
  appState.projectTaskMap = await loadTasksForProjects(appState.projects);
  appState.tasks = flattenProjectTasks();

  renderDashboardOverview();
  setApiStatus("API pronta");
}

async function loadTasksForProjects(projects) {
  const pairs = await Promise.all(projects.map(async (project) => {
    try {
      const payload = await apiRequest(`/projects/${encodeURIComponent(project.id)}/tasks`);
      return [project.id, normalizeList(payload).map((task) => normalizeTask(task, project))];
    } catch (error) {
      if (isAuthFailure(error)) throw error;
      return [project.id, []];
    }
  }));

  return new Map(pairs);
}

function flattenProjectTasks() {
  const tasks = [];
  appState.projectTaskMap.forEach((projectTasks) => {
    tasks.push(...projectTasks);
  });
  return tasks;
}

function renderDashboardWithoutOrganization() {
  setText("#dashboard-title", `Olá, ${appState.user?.username || "usuário"}`);
  setText("#dashboard-subtitle", "Crie uma organização para começar.");
  $("#dashboard-content")?.classList.add("is-hidden");
  $("#no-org-state")?.classList.remove("is-hidden");
  renderOrgSwitcher();
}

function renderDashboardOverview() {
  if (!appState.organization) {
    renderDashboardWithoutOrganization();
    return;
  }

  $("#no-org-state")?.classList.add("is-hidden");
  $("#dashboard-content")?.classList.remove("is-hidden");

  const query = ($("#global-search")?.value || "").trim().toLowerCase();
  const pendingTasks = appState.tasks.filter((task) => !isTaskDone(task));
  const doneTasks = appState.tasks.filter(isTaskDone);

  setText("#dashboard-title", `Olá, ${appState.user?.username || "usuário"}`);
  setText("#dashboard-subtitle", `Aqui está o resumo de ${appState.organization.name}.`);
  setText("#members-stat", String(appState.organization.members.length));
  setText("#projects-stat", String(appState.projects.length));
  setText("#completed-stat", String(doneTasks.length));
  setText("#pending-stat", String(pendingTasks.length));

  updateDashboardLinks();
  renderOrgSwitcher();
  renderOverviewProjects(filterProjects(appState.projects, query));
  renderOverviewMembers(filterMembers(appState.organization.members, query));
  renderOverviewTasks(filterTasks(pendingTasks, query));
  renderActivityFallback();
  renderInvitesPanel(appState.invites);
}

function updateDashboardLinks() {
  const orgId = appState.organization?.id || appState.currentOrgId;
  const firstProject = appState.projects[0];
  const orgUrl = `./organization.html?id=${encodeURIComponent(orgId)}`;

  setHref("#members-nav-link", orgUrl);
  setHref("#projects-nav-link", orgUrl);
  setHref("#view-projects-link", orgUrl);
  setHref("#view-members-link", orgUrl);
  setHref("#tasks-nav-link", firstProject
    ? `./project.html?id=${encodeURIComponent(firstProject.id)}&org=${encodeURIComponent(orgId)}`
    : orgUrl);
}

function renderOrgSwitcher() {
  const switcher = $("#org-switcher");
  if (!switcher) return;

  clearNode(switcher);
  if (appState.organizations.length === 0) {
    const option = document.createElement("option");
    option.textContent = "Nenhuma organização";
    option.value = "";
    switcher.append(option);
    switcher.disabled = true;
    return;
  }

  switcher.disabled = false;
  appState.organizations.forEach((org) => {
    const option = document.createElement("option");
    option.value = org.id;
    option.textContent = org.name;
    option.selected = org.id === appState.currentOrgId;
    switcher.append(option);
  });
}

function renderOverviewProjects(projects) {
  const container = $("#overview-projects");
  if (!container) return;
  clearNode(container);

  const visible = projects.slice(0, 5);
  if (visible.length === 0) {
    container.append(emptyMessage("Nenhum projeto para exibir."));
    return;
  }

  visible.forEach((project, index) => {
    container.append(createProjectRow(project, {
      orgId: appState.organization.id,
      tasks: appState.projectTaskMap.get(project.id) || [],
      index,
    }));
  });
}

function renderOverviewMembers(members) {
  const container = $("#overview-members");
  if (!container) return;
  clearNode(container);

  const visible = members.slice(0, 5);
  if (visible.length === 0) {
    container.append(emptyMessage("Nenhum membro cadastrado."));
    return;
  }

  visible.forEach((member) => {
    container.append(createMemberLine(member));
  });
}

function renderOverviewTasks(tasks) {
  const container = $("#overview-tasks");
  if (!container) return;
  clearNode(container);

  const visible = tasks.slice(0, 6);
  if (visible.length === 0) {
    container.append(emptyMessage("Nenhuma tarefa pendente."));
    return;
  }

  visible.forEach((task) => {
    container.append(createTaskRow(task, { compact: true, canEdit: false, canDelete: false }));
  });
}

function renderActivityFallback() {
  const container = $("#activity-list");
  if (!container) return;
  clearNode(container);

  container.append(createActivityItem("API", "Atividade recente depende de GET /organizations/<org_id>/activity."));
  container.append(createActivityItem("TASK", "Status, prazos e responsáveis aparecem quando o servidor expuser esses campos."));
}

function renderInvitesPanel(invites) {
  const panel = $("#invites-panel");
  const list = $("#invites-list");
  if (!panel || !list) return;

  if (!invites.length) {
    panel.classList.add("is-hidden");
    return;
  }

  panel.classList.remove("is-hidden");
  setText("#invites-count", String(invites.length));
  clearNode(list);

  invites.forEach((invite) => {
    const card = document.createElement("article");
    card.className = "invite-card";

    const text = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = invite.org_name || "Organização";
    const sender = document.createElement("span");
    sender.textContent = `Convidado por ${invite.member_username || "um membro"}`;
    text.append(title, sender);

    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "primary-button";
    accept.textContent = "Aceitar";
    accept.addEventListener("click", () => handleAcceptInviteById(invite.id, accept));

    card.append(text, accept);
    list.append(card);
  });
}

async function loadOrganizationPage() {
  const orgId = currentOrgIdFromPage();
  if (!orgId) {
    showOrganizationAccess("Organização não informada.");
    return;
  }

  setApiStatus("Sincronizando");
  const [orgResult, projectsPayload, membersPayload] = await Promise.all([
    apiRequest(`/organizations/${encodeURIComponent(orgId)}`).catch((error) => {
      if (isAuthFailure(error)) throw error;
      return null;
    }),
    apiRequest(`/organizations/${encodeURIComponent(orgId)}/projects`).catch((error) => {
      if (isAuthFailure(error)) throw error;
      return [];
    }),
    apiRequest(`/organizations/${encodeURIComponent(orgId)}/members`).catch((error) => {
      if (isAuthFailure(error)) throw error;
      return null;
    }),
  ]);

  appState.organization = orgResult
    ? normalizeOrganizationDetail(orgResult, orgId)
    : fallbackOrganizationDetail(null, orgId);

  // Substitui membros pelos do endpoint dedicado (contém member_id e created_at)
  const richMembers = normalizeList(membersPayload).map(normalizeMember);
  if (richMembers.length > 0) {
    appState.organization.members = richMembers;
  }
  appState.currentOrgId = appState.organization.id;
  appState.membership = findCurrentMembership(appState.organization.members);
  appState.projects = normalizeList(projectsPayload).map(normalizeProject);
  appState.projectTaskMap = await loadTasksForProjects(appState.projects);
  persistSelectedOrg();
  renderOrganizationPage();
  setApiStatus("API pronta");
}

function renderOrganizationPage() {
  const organization = appState.organization;
  const membership = appState.membership;

  if (!organization) {
    showOrganizationAccess("Organização não encontrada.");
    return;
  }

  setText("#org-title", organization.name);
  setText("#org-subtitle", `${organization.members.length} membro(s), ${appState.projects.length} projeto(s).`);
  setText("#role-chip", membership ? membership.role : "Sem acesso");
  setText("#members-stat", String(organization.members.length));
  setText("#projects-stat", String(appState.projects.length));
  setHref("#overview-nav-link", `./dashboard.html?org=${encodeURIComponent(organization.id)}`);

  $("#delete-org-button")?.classList.toggle("is-hidden", !isOwner(membership));
  setFormEnabled("#invite-section", canManageOrganization(membership));
  setFormEnabled("#project-form", canManageOrganization(membership));

  if (!membership) {
    showOrganizationAccess("Você ainda não faz parte dessa organização.");
    return;
  }

  $("#org-access-panel")?.classList.add("is-hidden");
  $("#org-content")?.classList.remove("is-hidden");
  renderMembersList($("#members-list"), organization.members);
  renderProjectsList($("#project-list"), appState.projects, organization.id);
}

function showOrganizationAccess(message) {
  const panel = $("#org-access-panel");
  $("#org-content")?.classList.add("is-hidden");
  setFormEnabled("#invite-section", false);
  setFormEnabled("#project-form", false);

  if (panel) {
    panel.classList.remove("is-hidden");
    const title = panel.querySelector("h2");
    if (title) title.textContent = message;
  }
}

function renderMembersList(container, members) {
  if (!container) return;
  clearNode(container);

  if (!members.length) {
    container.append(emptyMessage("Sem membros cadastrados."));
    return;
  }

  const canEdit = canManageOrganization(appState.membership);
  members.forEach((member) => {
    container.append(createMemberLine(member, { canEdit: canEdit && member.role !== "owner" }));
  });
}

function renderProjectsList(container, projects, orgId) {
  if (!container) return;
  clearNode(container);

  if (!projects.length) {
    container.append(emptyMessage("Sem projetos nesta organização."));
    return;
  }

  projects.forEach((project, index) => {
    container.append(createProjectRow(project, {
      orgId,
      tasks: appState.projectTaskMap.get(project.id) || [],
      index,
    }));
  });
}

async function loadProjectPage() {
  const projectId = getQueryParam("id");
  if (!projectId) {
    showProjectAccess("Projeto não informado.");
    return;
  }

  setApiStatus("Sincronizando");
  const projectPayload = await apiRequest(`/projects/${encodeURIComponent(projectId)}`).catch((error) => {
    if (isAuthFailure(error)) throw error;
    toast(error.message || "Projeto carregado parcialmente.", "error");
    return { data: { id: projectId, name: "Projeto", org_id: getQueryParam("org") } };
  });
  const project = normalizeProjectDetail(projectPayload, projectId);
  const orgId = getQueryParam("org") || project.org_id;
  appState.project = project;

  if (orgId) {
    const orgPayload = await apiRequest(`/organizations/${encodeURIComponent(orgId)}`).catch((error) => {
      if (isAuthFailure(error)) throw error;
      return null;
    });
    appState.organization = orgPayload
      ? normalizeOrganizationDetail(orgPayload, orgId)
      : fallbackOrganizationDetail(null, orgId);
    appState.currentOrgId = appState.organization.id;
    appState.membership = findCurrentMembership(appState.organization.members);
    persistSelectedOrg();
  }

  const tasksPayload = await apiRequest(`/projects/${encodeURIComponent(projectId)}/tasks`).catch((error) => {
    if (isAuthFailure(error)) throw error;
    toast(error.message || "Não foi possível carregar as tarefas agora.", "error");
    return [];
  });
  appState.tasks = normalizeList(tasksPayload).map((task) => normalizeTask(task, project));
  renderProjectPage();
  setApiStatus("API pronta");
}

function renderProjectPage() {
  const project = appState.project;
  const organization = appState.organization;
  const membership = appState.membership;

  if (!project) {
    showProjectAccess("Projeto não encontrado.");
    return;
  }

  $("#project-access-panel")?.classList.add("is-hidden");
  $("#project-content")?.classList.remove("is-hidden");
  setText("#project-title", project.name);
  setText("#project-subtitle", organization ? `Projeto em ${organization.name}.` : "Projeto selecionado.");
  setText("#tasks-stat", String(appState.tasks.length));
  setText("#project-completed-stat", `${formatProgress(appState.project?.progress ?? 0)}%`);
  setText("#project-org-stat", organization?.name || shortId(project.org_id));
  setText("#task-permission-chip", canManageOrganization(membership) ? "Pode excluir" : "Criar tarefas");

  const orgLink = $("#org-nav-link");
  if (orgLink && (project.org_id || organization?.id)) {
    const orgId = project.org_id || organization.id;
    orgLink.classList.remove("is-hidden");
    orgLink.href = `./organization.html?id=${encodeURIComponent(orgId)}`;
  }

  setFormEnabled("#task-form", Boolean(membership));
  renderProjectTasks($("#task-list"), appState.tasks, {
    canEdit: Boolean(membership),
    canDelete: canManageOrganization(membership),
  });
}

function showProjectAccess(message) {
  $("#project-content")?.classList.add("is-hidden");
  setFormEnabled("#task-form", false);
  const panel = $("#project-access-panel");
  if (panel) {
    panel.classList.remove("is-hidden");
    const title = panel.querySelector("h2");
    if (title) title.textContent = message;
  }
}

async function loadTaskPage() {
  const taskId = getQueryParam("id");
  const projectId = getQueryParam("project");
  const orgId = getQueryParam("org");

  if (!taskId) {
    showTaskAccess("Tarefa não informada.");
    return;
  }

  setApiStatus("Sincronizando");

  const taskPayload = await apiRequest(`/tasks/${encodeURIComponent(taskId)}`).catch((error) => {
    if (isAuthFailure(error)) throw error;
    toast(error.message || "Erro ao carregar tarefa.", "error");
    return null;
  });

  if (!taskPayload) {
    showTaskAccess("Tarefa não encontrada.");
    return;
  }

  const data = readData(taskPayload);
  appState.task = normalizeTask(data);

  const resolvedOrgId = orgId || "";
  const resolvedProjectId = stringify(data.project_id) || projectId;

  if (resolvedOrgId) {
    const orgPayload = await apiRequest(`/organizations/${encodeURIComponent(resolvedOrgId)}`).catch((error) => {
      if (isAuthFailure(error)) throw error;
      return null;
    });
    appState.organization = orgPayload
      ? normalizeOrganizationDetail(orgPayload, resolvedOrgId)
      : fallbackOrganizationDetail(null, resolvedOrgId);
    appState.membership = findCurrentMembership(appState.organization.members);
  }

  // Montar links de navegação
  if (resolvedProjectId) {
    const projectLink = $("#project-nav-link");
    if (projectLink) {
      projectLink.href = `./project.html?id=${encodeURIComponent(resolvedProjectId)}${resolvedOrgId ? `&org=${encodeURIComponent(resolvedOrgId)}` : ""}`;
      projectLink.classList.remove("is-hidden");
    }
  }

  if (resolvedOrgId) {
    const orgLink = $("#org-nav-link");
    if (orgLink) {
      orgLink.href = `./organization.html?id=${encodeURIComponent(resolvedOrgId)}`;
      orgLink.classList.remove("is-hidden");
    }
  }

  renderTaskPage();
  setApiStatus("API pronta");
}

function renderTaskPage() {
  const task = appState.task;
  const membership = appState.membership;

  if (!task) {
    showTaskAccess("Tarefa não encontrada.");
    return;
  }

  $("#task-access-panel")?.classList.add("is-hidden");
  $("#task-content")?.classList.remove("is-hidden");

  setText("#task-title", task.name || "Tarefa");
  setText("#task-subtitle", task.project_name ? `Projeto: ${task.project_name}` : "Tarefa do projeto.");
  setText("#task-priority-stat", priorityLabel(task.priority));
  setText("#task-project-stat", task.project_name || shortId(task.project_id));
  setText("#task-completed-stat", isTaskDone(task) ? "Concluída" : "Pendente");
  setText("#task-date-stat", task.created_at ? formatDate(task.created_at) : "—");
  setText("#task-description", task.description || "Sem descrição.");
  setText("#task-status-chip", priorityLabel(task.priority));

  const actionsPanel = $("#task-actions-panel");
  if (membership) {
    actionsPanel?.classList.remove("is-hidden");
    const completeBtn = $("#complete-task-btn");
    if (completeBtn) {
      completeBtn.disabled = isTaskDone(task);
      completeBtn.textContent = isTaskDone(task) ? "Já concluída" : "Concluir tarefa";
    }
    const canDelete = canManageOrganization(membership);
    const deleteBtn = $("#delete-task-btn");
    if (deleteBtn) deleteBtn.classList.toggle("is-hidden", !canDelete);
  } else {
    actionsPanel?.classList.add("is-hidden");
  }
}

function showTaskAccess(message) {
  $("#task-content")?.classList.add("is-hidden");
  const panel = $("#task-access-panel");
  if (panel) {
    panel.classList.remove("is-hidden");
    const title = panel.querySelector("h2");
    if (title) title.textContent = message;
  }
}

function renderProjectTasks(container, tasks, options) {
  if (!container) return;
  clearNode(container);

  if (!tasks.length) {
    container.append(emptyMessage("Sem tarefas neste projeto."));
    return;
  }

  tasks.forEach((task) => {
    container.append(createTaskRow(task, options));
  });
}

function createProjectRow(project, { orgId, tasks = [], index = 0 }) {
  const link = document.createElement("a");
  link.className = "project-row";
  link.href = `./project.html?id=${encodeURIComponent(project.id)}&org=${encodeURIComponent(orgId)}`;

  const icon = document.createElement("span");
  icon.className = "row-icon";
  icon.textContent = `P${index + 1}`;

  const title = document.createElement("span");
  title.className = "row-title";
  const name = document.createElement("strong");
  name.textContent = project.name;
  const subtitle = document.createElement("span");
  subtitle.textContent = project.description || "Projeto da organização";
  title.append(name, subtitle);

  const progress = document.createElement("span");
  progress.className = "progress-track";
  const fill = document.createElement("span");
  fill.className = "progress-fill";
  const progressValue = getProjectProgress(project, tasks);
  fill.style.width = `${progressValue}%`;
  progress.append(fill);

  const percent = document.createElement("strong");
  percent.textContent = `${formatProgress(progressValue)}%`;

  const status = document.createElement("span");
  status.className = "tag";
  status.textContent = getProjectStatusLabel(project, tasks);

  link.append(icon, title, progress, percent, status);
  return link;
}

function createMemberLine(member, { canEdit = false } = {}) {
  const row = document.createElement("article");
  row.className = "member-line";

  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.textContent = initials(member.username);

  const title = document.createElement("span");
  title.className = "row-title";
  const name = document.createElement("strong");
  name.textContent = member.username || "Usuário";
  const role = document.createElement("span");
  role.textContent = member.role || "member";
  title.append(name, role);

  const badge = document.createElement("span");
  badge.className = "tag low";
  badge.textContent = member.role || "member";

  row.append(avatar, title, badge);

  if (canEdit && member.member_id) {
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "ghost-button member-edit-btn";
    editBtn.textContent = "Editar";
    editBtn.addEventListener("click", () => openMemberEditDialog(member));
    row.append(editBtn);
  }

  return row;
}

function createTaskRow(task, { compact = false, canEdit = false, canDelete = false } = {}) {
  const row = document.createElement("article");
  row.className = "task-row";
  row.classList.toggle("done", isTaskDone(task));

  const check = document.createElement("span");
  check.className = "task-check";
  check.textContent = isTaskDone(task) ? "OK" : "";

  const main = document.createElement("span");
  main.className = "task-main";
  const title = document.createElement("strong");
  title.textContent = task.name;
  main.append(title);

  const project = document.createElement("span");
  project.className = "tag";
  project.textContent = task.project_name || "Projeto";

  const due = document.createElement("span");
  due.className = "muted";
  due.textContent = task.due_date ? formatDate(task.due_date) : task.created_at ? `Criada ${formatDate(task.created_at)}` : "Sem prazo";

  const priority = document.createElement("span");
  priority.className = `tag ${priorityClass(task.priority)}`;
  priority.textContent = priorityLabel(task.priority);

  row.append(check, main, project, due, priority);

  if (!compact && task.id) {
    const actions = document.createElement("span");
    actions.className = "task-actions";

    const taskUrl = buildTaskUrl(task);
    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "ghost-button";
    viewBtn.textContent = "Ver";
    viewBtn.addEventListener("click", () => { location.href = taskUrl; });
    actions.append(viewBtn);

    row.append(actions);
  }

  return row;
}

function buildTaskUrl(task) {
  const orgId = appState.organization?.id || appState.currentOrgId || getQueryParam("org");
  const projectId = task.project_id || getQueryParam("id");
  const params = new URLSearchParams({ id: task.id });
  if (projectId) params.set("project", projectId);
  if (orgId) params.set("org", orgId);
  return `./task.html?${params.toString()}`;
}

function createActivityItem(label, text) {
  const item = document.createElement("article");
  item.className = "activity-item";
  const dot = document.createElement("span");
  dot.className = "activity-dot";
  dot.textContent = label.slice(0, 2).toUpperCase();
  const copy = document.createElement("span");
  copy.className = "row-title";
  const strong = document.createElement("strong");
  strong.textContent = label;
  const desc = document.createElement("span");
  desc.textContent = text;
  copy.append(strong, desc);
  item.append(dot, copy);
  return item;
}

async function handleCreateOrganization(event) {
  event.preventDefault();
  const input = $("#org-name-input");
  const name = input?.value.trim();
  if (!name) return;

  await runWithStatus(event.submitter, async () => {
    const payload = await apiRequest("/organizations", {
      method: "POST",
      body: { name },
    });

    const data = readData(payload);
    const orgId = stringify(data.org_id || data.id);
    toast("Organização criada.", "success");

    if (orgId) {
      appState.currentOrgId = orgId;
      persistSelectedOrg();
    }

    input.value = "";
    if (page === "dashboard") {
      await loadDashboard();
    } else if (orgId) {
      goTo(`organization.html?id=${encodeURIComponent(orgId)}`);
    }
  });
}

async function handleAcceptInviteById(inviteId, button) {
  if (!inviteId) return;

  await runWithStatus(button, async () => {
    await apiRequest(`/invite/${encodeURIComponent(inviteId)}`);
    toast("Convite aceito.", "success");
    await loadDashboard();
  });
}

async function handleSearchUser() {
  const input = $("#invite-username-search");
  const username = input?.value.trim();
  const resultBox = $("#invite-result");
  if (!username || !resultBox) return;

  await runWithStatus($("#invite-search-btn"), async () => {
    const payload = await apiRequest(`/users/${encodeURIComponent(username)}`);
    const data = readData(payload);
    renderInviteResult(resultBox, stringify(data.username || username), stringify(data.id));
  });
}

function renderInviteResult(container, username, userId) {
  container.classList.remove("is-hidden");
  clearNode(container);

  if (!userId) {
    const error = document.createElement("p");
    error.className = "invite-result-error";
    error.textContent = "Usuário não encontrado.";
    container.append(error);
    return;
  }

  const name = document.createElement("strong");
  name.className = "invite-result-name";
  name.textContent = username;

  const id = document.createElement("span");
  id.className = "invite-result-id muted";
  id.textContent = shortId(userId);

  const send = document.createElement("button");
  send.type = "button";
  send.className = "primary-button";
  send.textContent = "Convidar";
  send.addEventListener("click", () => handleSendInvite(userId, send));

  container.append(name, id, send);
}

async function handleSendInvite(userId, button) {
  const orgId = currentOrgIdFromPage();
  if (!userId || !orgId) return;

  await runWithStatus(button, async () => {
    await apiRequest(`/organizations/${encodeURIComponent(orgId)}/invite`, {
      method: "POST",
      body: { user_invited_id: userId },
    });

    $("#invite-username-search").value = "";
    $("#invite-result")?.classList.add("is-hidden");
    toast("Convite enviado.", "success");
  });
}

function openMemberEditDialog(member) {
  appState.editingMemberId = member.member_id;
  setText("#member-edit-username", member.username);
  const roleSelect = $("#member-edit-role");
  if (roleSelect) roleSelect.value = member.role;
  $("#member-edit-dialog")?.showModal();
}

function closeMemberEditDialog() {
  const dialog = $("#member-edit-dialog");
  if (dialog?.open) dialog.close();
  appState.editingMemberId = "";
}

async function handleEditMember(event) {
  event.preventDefault();
  const memberId = appState.editingMemberId;
  const role = $("#member-edit-role")?.value;
  if (!memberId || !role) return;

  await runWithStatus(event.submitter, async () => {
    await apiRequest(`/organizations/members/${encodeURIComponent(memberId)}`, {
      method: "PATCH",
      body: { role },
    });
    closeMemberEditDialog();
    toast("Cargo atualizado.", "success");
    await loadOrganizationPage();
  });
}

async function handleCreateProject(event) {
  event.preventDefault();
  const input = $("#project-name-input");
  const name = input?.value.trim();
  const orgId = currentOrgIdFromPage();
  if (!name || !orgId) return;

  await runWithStatus(event.submitter, async () => {
    const payload = await apiRequest(`/organizations/${encodeURIComponent(orgId)}/projects`, {
      method: "POST",
      body: { name },
    });

    const data = readData(payload);
    const projectId = stringify(data.id || data.project_id);
    toast("Projeto criado.", "success");

    if (projectId) {
      goTo(`project.html?id=${encodeURIComponent(projectId)}&org=${encodeURIComponent(orgId)}`);
    } else {
      input.value = "";
      await loadOrganizationPage();
    }
  });
}

async function handleDeleteOrganization() {
  const organization = appState.organization;
  if (!organization?.id) return;

  const confirmed = await confirmAction({
    title: "Excluir organização",
    message: `Excluir "${organization.name}"?`,
    actionText: "Excluir",
  });

  if (!confirmed) return;

  await runWithStatus($("#delete-org-button"), async () => {
    await apiRequest(`/organizations/${encodeURIComponent(organization.id)}`, {
      method: "DELETE",
    });
    toast("Organização excluída.", "success");
    localStorage.removeItem(storageKeys.selectedOrg);
    goTo("dashboard.html");
  });
}

async function handleCreateTask(event) {
  event.preventDefault();
  const nameInput = $("#task-name-input");
  const descriptionInput = $("#task-description-input");
  const priorityInput = $("#task-priority-input");
  const name = nameInput?.value.trim();
  const description = descriptionInput?.value.trim();
  const priority = priorityInput?.value || "normal";
  const projectId = getQueryParam("id");

  if (!name || !description || !priority || !projectId) return;

  await runWithStatus(event.submitter, async () => {
    await apiRequest(`/projects/${encodeURIComponent(projectId)}/tasks`, {
      method: "POST",
      body: { name, description, priority },
    });
    nameInput.value = "";
    descriptionInput.value = "";
    if (priorityInput) priorityInput.value = "normal";
    toast("Tarefa adicionada.", "success");
    await loadProjectPage();
  });
}

function openTaskEditDialog(task) {
  const dialog = $("#task-edit-dialog");
  appState.editingTaskId = task.id;
  $("#task-edit-name").value = task.name || "";
  $("#task-edit-description").value = task.description || "";
  $("#task-edit-priority").value = task.priority || "normal";
  dialog?.showModal();
}

function closeTaskEditDialog() {
  const dialog = $("#task-edit-dialog");
  if (dialog?.open) dialog.close();
  appState.editingTaskId = "";
}

async function handleEditTask(event) {
  event.preventDefault();
  const taskId = appState.editingTaskId;
  const name = $("#task-edit-name")?.value.trim();
  const description = $("#task-edit-description")?.value.trim();
  const priority = $("#task-edit-priority")?.value || "normal";
  if (!taskId || !name || !description || !priority) return;

  await runWithStatus(event.submitter, async () => {
    await apiRequest(`/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: { name, description, priority },
    });
    closeTaskEditDialog();
    toast("Tarefa atualizada.", "success");
    if (page === "task") {
      await loadTaskPage();
    } else {
      await loadProjectPage();
    }
  });
}

async function handleCompleteTask(task, button) {
  if (!task?.id) return;

  await runWithStatus(button, async () => {
    await apiRequest(`/tasks/${encodeURIComponent(task.id)}/complete`);
    toast("Tarefa concluída.", "success");
    if (page === "task") {
      await loadTaskPage();
    } else {
      await loadProjectPage();
    }
  });
}

async function handleDeleteTask(task) {
  const confirmed = await confirmAction({
    title: "Excluir tarefa",
    message: `Remover "${task.name}" do projeto?`,
    actionText: "Excluir",
  });

  if (!confirmed) return;

  await runWithStatus(null, async () => {
    await apiRequest(`/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
    toast("Tarefa excluída.", "success");
    if (page === "task") {
      const projectId = getQueryParam("project");
      const orgId = getQueryParam("org");
      const params = new URLSearchParams();
      if (projectId) params.set("id", projectId);
      if (orgId) params.set("org", orgId);
      goTo(`./project.html?${params.toString()}`);
    } else {
      await loadProjectPage();
    }
  });
}

async function apiRequest(path, options = {}) {
  const url = `${getApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(options.headers || {});

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (!options.skipAuth && appState.token) {
    headers.set("Authorization", `Bearer ${appState.token}`);
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const payload = await parseResponse(response);

  if (!response.ok) {
    const error = new Error(extractErrorMessage(payload, response.status));
    error.status = response.status;
    error.payload = payload;
    error.code = payload?.error?.code || payload?.msg || "";
    throw error;
  }

  return payload;
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function extractErrorMessage(payload, status) {
  const apiError = payload?.error;
  return apiError?.message
    || apiError?.messsage
    || payload?.msg
    || payload?.message
    || `Requisição falhou com status ${status}.`;
}

function normalizeOrganizationsPayload(payload) {
  const data = readData(payload);
  if (Array.isArray(data)) return data;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(data.organizations)) return data.organizations;
  if (Array.isArray(data.orgs_user_is_member)) return data.orgs_user_is_member;
  if (Array.isArray(data.items)) return data.items;
  return [];
}

function normalizeList(payload) {
  const data = readData(payload);
  if (Array.isArray(data)) return data;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(data.items)) return data.items;
  return [];
}

function normalizeOrganization(raw) {
  return {
    id: stringify(raw.id || raw.org_id),
    name: stringify(raw.name || raw.org_name || "Organização"),
  };
}

function normalizeOrganizationDetail(payload, fallbackId) {
  const data = readData(payload);
  return {
    id: stringify(data.id || data.org_id || fallbackId),
    name: stringify(data.name || data.org_name || "Organização"),
    members: Array.isArray(data.members) ? data.members.map(normalizeMember) : [],
    projects: Array.isArray(data.projects) ? data.projects.map(normalizeProject) : [],
    created_at: stringify(data.created_at || ""),
  };
}

function fallbackOrganizationDetail(summary, fallbackId) {
  return {
    id: stringify(summary?.id || fallbackId),
    name: stringify(summary?.name || "Organização"),
    members: [],
    projects: [],
    created_at: stringify(summary?.created_at || ""),
  };
}

function normalizeMember(raw) {
  return {
    member_id: stringify(raw.member_id || ""),
    user_id: stringify(raw.user_id || raw.id),
    username: stringify(raw.username || "Usuário"),
    role: stringify(raw.role || "member"),
    created_at: stringify(raw.created_at || ""),
    avatar_url: stringify(raw.avatar_url || ""),
  };
}

function normalizeProject(raw) {
  return {
    id: stringify(raw.id || raw.project_id),
    name: stringify(raw.name || "Projeto"),
    org_id: stringify(raw.org_id),
    status: stringify(raw.status || ""),
    progress: raw.progress,
    description: stringify(raw.description || ""),
    created_at: stringify(raw.created_at || ""),
  };
}

function normalizeProjectDetail(payload, fallbackId) {
  const data = readData(payload);
  return {
    id: stringify(data.id || data.project_id || fallbackId),
    name: stringify(data.name || "Projeto"),
    org_id: stringify(data.org_id),
    status: stringify(data.status || ""),
    progress: data.progress,
    description: stringify(data.description || ""),
    created_at: stringify(data.created_at || ""),
  };
}

function normalizeTask(raw, project = {}) {
  return {
    id: stringify(raw.id || raw.task_id),
    name: stringify(raw.name || "Tarefa"),
    description: stringify(raw.description || ""),
    status: stringify(raw.status || ""),
    priority: stringify(raw.priority || ""),
    due_date: stringify(raw.due_date || ""),
    created_at: stringify(raw.created_at || ""),
    is_completed: Boolean(raw.is_completed),
    assignee_id: stringify(raw.assignee_id || ""),
    project_id: stringify(raw.project_id || project.id),
    project_name: stringify(raw.project_name || project.name || "Projeto"),
  };
}

function normalizeInvitesList(payload) {
  if (!payload) return [];
  const data = readData(payload);
  const list = Array.isArray(data) ? data : [];
  return list.map((raw) => ({
    id: stringify(raw.id),
    org_id: stringify(raw.org_id),
    org_name: stringify(raw.org_name || "Organização"),
    member_username: stringify(raw.member_username || ""),
  }));
}

function readData(payload) {
  return payload?.data || payload || {};
}

function chooseCurrentOrganization() {
  const queryOrg = getQueryParam("org");
  const savedOrg = appState.currentOrgId;
  const ids = appState.organizations.map((org) => org.id);
  appState.currentOrgId = ids.includes(queryOrg)
    ? queryOrg
    : ids.includes(savedOrg)
      ? savedOrg
      : ids[0] || "";
  persistSelectedOrg();
}

function currentOrgIdFromPage() {
  return getQueryParam("id") || getQueryParam("org") || appState.currentOrgId;
}

function findCurrentMembership(members) {
  const userId = stringify(appState.user?.id).toLowerCase();
  const username = stringify(appState.user?.username).toLowerCase();

  return members.find((member) => {
    const memberId = stringify(member.user_id).toLowerCase();
    const memberName = stringify(member.username).toLowerCase();
    return (userId && memberId === userId) || (username && memberName === username);
  });
}

function canManageOrganization(member) {
  return ["owner", "admin"].includes(stringify(member?.role).toLowerCase());
}

function isOwner(member) {
  return stringify(member?.role).toLowerCase() === "owner";
}

function isTaskDone(task) {
  if (task?.is_completed === true) return true;
  const status = stringify(task.status).toLowerCase();
  return status === "done" || status === "completed" || status === "concluida" || status === "concluída";
}

function getProjectProgress(project, tasks) {
  if (project.progress !== undefined && project.progress !== null && project.progress !== "") {
    const value = Number(project.progress);
    return Number.isFinite(value) ? clamp(value, 0, 100) : 0;
  }

  if (tasks.length > 0 && (tasks.some((task) => task.status) || tasks.some((task) => task.is_completed))) {
    const done = tasks.filter(isTaskDone).length;
    return Math.round((done / tasks.length) * 1000) / 10;
  }

  return 0;
}

function getProjectStatusLabel(project, tasks) {
  const status = stringify(project.status).toLowerCase();
  if (status === "planning") return "Planejamento";
  if (status === "done" || status === "completed") return "Concluído";
  if (status === "in_progress") return "Em andamento";
  const progress = getProjectProgress(project, tasks);
  if (progress >= 100) return "Concluído";
  if (progress > 0) return "Em andamento";
  if (tasks.length === 0) return "Sem tarefas";
  return "Em andamento";
}

function priorityLabel(priority) {
  const value = stringify(priority).toLowerCase();
  if (value === "very high") return "Muito alta";
  if (value === "high") return "Alta";
  if (value === "low") return "Baixa";
  if (value === "normal") return "Normal";
  return "";
}

function priorityClass(priority) {
  const value = stringify(priority).toLowerCase();
  if (value === "very high") return "high";
  if (value === "high") return "high";
  if (value === "low") return "low";
  if (value === "normal") return "medium";
  return "";
}

function formatProgress(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function filterProjects(projects, query) {
  if (!query) return projects;
  return projects.filter((project) => project.name.toLowerCase().includes(query));
}

function filterMembers(members, query) {
  if (!query) return members;
  return members.filter((member) => member.username.toLowerCase().includes(query) || member.role.toLowerCase().includes(query));
}

function filterTasks(tasks, query) {
  if (!query) return tasks;
  return tasks.filter((task) => {
    return task.name.toLowerCase().includes(query)
      || task.description.toLowerCase().includes(query)
      || task.project_name.toLowerCase().includes(query);
  });
}

async function runWithStatus(button, task) {
  const control = button instanceof HTMLElement ? button : null;
  const originalText = control?.textContent;
  const canSwapText = control?.tagName === "BUTTON" && !control.classList.contains("nav-button");

  try {
    if (control) {
      control.disabled = true;
      if (originalText && canSwapText) control.textContent = "Aguarde";
    }
    return await task();
  } catch (error) {
    handleError(error);
    return false;
  } finally {
    if (control) {
      control.disabled = false;
      if (originalText && canSwapText) control.textContent = originalText;
    }
  }
}

function handleError(error) {
  if (isAuthFailure(error)) {
    toast("Sessão expirada. Entre novamente.", "error");
    clearSession();
    goTo("login.html");
    return;
  }

  toast(error?.message || "Algo deu errado.", "error");
  setApiStatus(error?.status ? `Erro ${error.status}` : "Erro");
}

function isAuthFailure(error) {
  if (error?.status !== 401) return false;
  if (error?.payload?.msg) return true;

  const message = stringify(error?.message).toLowerCase();
  return message.includes("token")
    || message.includes("jwt")
    || message.includes("authorization")
    || message.includes("signature")
    || message.includes("expired");
}

function saveSession(data, fallbackUsername) {
  const token = data.access_token || "";
  const user = data.user || { username: fallbackUsername };

  if (!token) {
    throw new Error("Token de acesso não veio na resposta.");
  }

  appState.token = token;
  appState.user = {
    id: stringify(user.id),
    username: stringify(user.username || fallbackUsername),
  };

  localStorage.setItem(storageKeys.token, appState.token);
  localStorage.setItem(storageKeys.user, JSON.stringify(appState.user));
}

function logout() {
  clearSession();
  goTo("login.html");
}

function clearSession() {
  appState.token = "";
  appState.user = null;
  localStorage.removeItem(storageKeys.token);
  localStorage.removeItem(storageKeys.user);
}

function requireAuth() {
  if (appState.token) return true;
  goTo("login.html", true);
  return false;
}

function renderSessionLabels() {
  document.querySelectorAll("[data-current-user]").forEach((node) => {
    node.textContent = appState.user?.username || "Usuário";
  });
  document.querySelectorAll("[data-current-avatar]").forEach((node) => {
    node.textContent = initials(appState.user?.username || "U");
  });
}

function getApiBase() {
  return normalizeApiBase(localStorage.getItem(storageKeys.apiBase) || defaultApiBase);
}

function normalizeApiBase(value) {
  const base = (value || defaultApiBase).trim();
  return base.replace(/\/+$/, "");
}

function persistSelectedOrg() {
  if (appState.currentOrgId) {
    localStorage.setItem(storageKeys.selectedOrg, appState.currentOrgId);
  } else {
    localStorage.removeItem(storageKeys.selectedOrg);
  }
}

function setApiStatus(text) {
  document.querySelectorAll("#api-status").forEach((node) => {
    node.textContent = text;
  });
}

function setFormEnabled(selector, enabled) {
  const form = $(selector);
  if (!form) return;
  form.querySelectorAll("input, textarea, button").forEach((control) => {
    control.disabled = !enabled;
  });
  form.classList.toggle("is-disabled", !enabled);
}

function setText(selector, text) {
  const node = $(selector);
  if (node) node.textContent = text;
}

function setHref(selector, href) {
  const node = $(selector);
  if (node) node.href = href;
}

function clearNode(node) {
  while (node?.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function emptyMessage(message) {
  const paragraph = document.createElement("p");
  paragraph.className = "empty-copy";
  paragraph.textContent = message;
  return paragraph;
}

async function confirmAction({ title, message, actionText }) {
  const dialog = $("#confirm-dialog");
  if (!dialog?.showModal) {
    return window.confirm(message);
  }

  setText("#confirm-title", title);
  setText("#confirm-message", message);
  setText("#confirm-action", actionText || "Confirmar");
  dialog.showModal();

  return new Promise((resolve) => {
    const onClose = () => {
      dialog.removeEventListener("close", onClose);
      resolve(dialog.returnValue === "confirm");
    };
    dialog.addEventListener("close", onClose);
  });
}

async function copyText(text, successMessage) {
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    toast(successMessage, "success");
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    toast(successMessage, "success");
  }
}

function toast(message, type = "info") {
  const region = $("#toast-region");
  if (!region) return;

  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  region.append(item);

  window.setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateY(-6px)";
    item.style.transition = "opacity 180ms ease, transform 180ms ease";
  }, 3400);

  window.setTimeout(() => item.remove(), 3700);
}

function goTo(path, replace = false) {
  if (replace) {
    window.location.replace(path);
    return;
  }
  window.location.href = path;
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name) || "";
}

function stringify(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function shortId(value) {
  const text = stringify(value);
  if (!text) return "ID indisponível";
  return text.length > 12 ? `${text.slice(0, 8)}...${text.slice(-4)}` : text;
}

function initials(value) {
  const parts = stringify(value).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function $(selector) {
  return document.querySelector(selector);
}
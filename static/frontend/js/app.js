const storageKeys = {
  token: "taskforge.token",
  user: "taskforge.user",
  apiBase: "taskforge.apiBase",
};

const defaultApiBase = window.location.protocol === "file:"
  ? "http://127.0.0.1:5000/api"
  : "/api";

const page = document.body.dataset.page || "redirect";
const appState = {
  token: localStorage.getItem(storageKeys.token) || "",
  user: readJson(storageKeys.user),
  organizations: [],
  invites: [],
  organization: null,
  membership: null,
  projects: [],
  tasks: [],
  project: null,
  task: null,
  taskNextCursor: null,
  taskLimit: 10,
  profile: null,
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
    profile: initProfilePage,
  };

  (initializers[page] || initRedirect)();
}

// ── Page initializers ─────────────────────────────────────

function initRedirect() {
  goTo(appState.token ? "dashboard.html" : "login.html", true);
}

function initLogin() {
  if (appState.token) { goTo("dashboard.html", true); return; }

  $("#login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = $("#login-username").value.trim();
    const password = $("#login-password").value;
    if (!username || !password) { toast("Preencha usuário e senha.", "error"); return; }

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
  if (appState.token) { goTo("dashboard.html", true); return; }

  $("#register-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = $("#register-username").value.trim();
    const password = $("#register-password").value;
    if (!username || !password) { toast("Preencha usuário e senha.", "error"); return; }

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
  $("#create-org-form")?.addEventListener("submit", handleCreateOrganization);
  $("#org-search-btn")?.addEventListener("click", handleOrganizationSearch);
  $("#org-search-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleOrganizationSearch(); }
  });
  $("#org-search-input")?.addEventListener("input", (e) => {
    if (!e.target.value.trim()) renderOrgCards(appState.organizations, { label: "Todas" });
  });
  initPfpUpload();
  runWithStatus(null, loadDashboard);
}

function initOrganizationPage() {
  if (!requireAuth()) return;
  $("#project-form")?.addEventListener("submit", handleCreateProject);
  $("#invite-search-btn")?.addEventListener("click", handleSearchUser);
  $("#invite-username-search")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); handleSearchUser(); }
  });
  $("#delete-org-button")?.addEventListener("click", handleDeleteOrganization);
  $("#member-edit-form")?.addEventListener("submit", handleEditMember);
  $("#member-edit-cancel")?.addEventListener("click", closeMemberEditDialog);
  $("#org-edit-form")?.addEventListener("submit", handleEditOrganization);
  $("#remove-org-img-btn")?.addEventListener("click", handleRemoveOrgImage);
  $("#edit-org-button")?.addEventListener("click", () => {
    $("#org-edit-form")?.classList.toggle("is-hidden");
  });
  $("#copy-org-id")?.addEventListener("click", () => {
    copyText(getQueryParam("id"), "ID da organização copiado.");
  });
  initPfpUpload();
  runWithStatus(null, loadOrganizationPage);
}

function initProjectPage() {
  if (!requireAuth()) return;
  $("#task-form")?.addEventListener("submit", handleCreateTask);
  $("#copy-project-id")?.addEventListener("click", () => {
    copyText(getQueryParam("id"), "ID do projeto copiado.");
  });
  $("#load-more-tasks")?.addEventListener("click", (event) => {
    runWithStatus(event.currentTarget, () => loadMoreTasks());
  });
  initPfpUpload();
  runWithStatus(null, loadProjectPage);
}

function initTaskPage() {
  if (!requireAuth()) return;
  $("#task-edit-form")?.addEventListener("submit", handleEditTask);
  $("#task-edit-cancel")?.addEventListener("click", closeTaskEditDialog);
  $("#edit-task-btn")?.addEventListener("click", () => openTaskEditDialog(appState.task));
  $("#complete-task-btn")?.addEventListener("click", () => handleCompleteTask(appState.task, $("#complete-task-btn")));
  $("#delete-task-btn")?.addEventListener("click", () => handleDeleteTask(appState.task));
  initPfpUpload();
  runWithStatus(null, loadTaskPage);
}

function initProfilePage() {
  if (!requireAuth()) return;
  initPfpUpload();
  $("#profile-edit-form")?.addEventListener("submit", handleEditProfile);
  $("#remove-pfp-btn")?.addEventListener("click", handleRemovePfp);
  $("#profile-invite-btn")?.addEventListener("click", (event) => {
    handleSendInvite(appState.profile?.id, event.currentTarget);
  });
  runWithStatus(null, loadProfilePage);
}

// ── Dashboard ─────────────────────────────────────────────

async function loadDashboard() {
  setApiStatus("Sincronizando");

  const userId = appState.user?.id;
  if (!userId) { toast("Sessão inválida.", "error"); logout(); return; }

  const [userPayload, invitesPayload] = await Promise.all([
    apiRequest(`/users?id=${encodeURIComponent(userId)}`).catch((e) => {
      if (isAuthFailure(e)) throw e;
      return null;
    }),
    apiRequest("/users/invites").catch((e) => {
      if (isAuthFailure(e)) throw e;
      return null;
    }),
  ]);

  const userData = readData(userPayload);
  const organizations = Array.isArray(userData.orgs_user_is_member)
    ? userData.orgs_user_is_member.map(normalizeOrganization)
    : [];
  appState.organizations = await enrichOrganizations(organizations);
  appState.invites = normalizeInvitesList(invitesPayload);

  // Atualiza pfp_url caso tenha mudado desde o login
  if (userData.pfp_url !== undefined) {
    appState.user = { ...appState.user, pfp_url: stringify(userData.pfp_url) };
    localStorage.setItem(storageKeys.user, JSON.stringify(appState.user));
    renderCurrentUserAvatar();
  }

  renderDashboard();
  setApiStatus("API pronta");
}

function renderDashboard() {
  setText("#dashboard-title", `Olá, ${appState.user?.username || "usuário"}`);
  renderInvitesPanel(appState.invites);
  renderOrgCards(appState.organizations);
}

function renderOrgCards(orgs) {
  const container = $("#orgs-list");
  if (!container) return;
  clearNode(container);

  if (!orgs.length) {
    container.append(emptyMessage("Você ainda não faz parte de nenhuma organização."));
    return;
  }

  orgs.forEach((org) => {
    const card = document.createElement("a");
    card.className = "org-card";
    card.href = `./organization.html?id=${encodeURIComponent(org.id)}`;

    const imgEl = document.createElement("span");
    imgEl.className = "org-card-img";
    if (org.image_url) {
      const img = document.createElement("img");
      img.src = org.image_url;
      img.alt = org.name;
      img.className = "avatar-img";
      imgEl.append(img);
    } else {
      imgEl.textContent = initials(org.name);
    }

    const info = document.createElement("span");
    info.className = "org-card-info";
    const name = document.createElement("strong");
    name.textContent = org.name;
    const desc = document.createElement("span");
    desc.textContent = org.description || "";
    info.append(name, desc);

    card.append(imgEl, info);
    container.append(card);
  });
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

// ── Organization page ─────────────────────────────────────

function renderDashboard() {
  setText("#dashboard-title", `Olá, ${appState.user?.username || "usuário"}`);
  setText("#orgs-total", String(appState.organizations.length));
  setText("#open-tasks-total", String(sumOpenTasks(appState.organizations)));
  renderInvitesPanel(appState.invites);
  renderOrgCards(appState.organizations, { label: "Todas" });
}

function renderOrgCards(orgs, { label = "" } = {}) {
  const container = $("#orgs-list");
  if (!container) return;
  clearNode(container);
  if (label) setText("#orgs-result-label", label);
  setText("#orgs-total", String(orgs.length));
  setText("#open-tasks-total", String(sumOpenTasks(orgs)));

  if (!orgs.length) {
    container.append(emptyMessage("Nenhuma organização encontrada."));
    return;
  }

  orgs.forEach((org) => {
    const card = document.createElement("article");
    card.className = "org-card";

    // ── Header (avatar + info) ──
    const header = document.createElement("div");
    header.className = "org-card-header";

    const imgEl = document.createElement("span");
    imgEl.className = "org-card-img";
    if (org.image_url) {
      const img = document.createElement("img");
      img.src = org.image_url;
      img.alt = org.name;
      img.className = "avatar-img";
      imgEl.append(img);
    } else {
      imgEl.textContent = initials(org.name);
    }

    const info = document.createElement("div");
    info.className = "org-card-info";
    const name = document.createElement("strong");
    name.textContent = org.name;
    const desc = document.createElement("span");
    desc.textContent = org.description || "Workspace TaskForge";
    info.append(name, desc);

    header.append(imgEl, info);

    // ── Divider ──
    const divider = document.createElement("div");
    divider.className = "org-card-divider";

    // ── Stats ──
    const stats = document.createElement("div");
    stats.className = "org-card-stats";
    stats.append(
      orgStat("Membros", formatCount(org.members_count)),
      orgStat("Tarefas", formatCount(org.open_tasks_count)),
      orgStat("Atividade", org.last_activity ? relativeDateLabel(org.last_activity) : "—")
    );

    // ── Action ──
    const access = document.createElement("a");
    access.className = "org-card-action";
    access.href = `./organization.html?id=${encodeURIComponent(org.id)}`;
    access.innerHTML = `Acessar organização <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    card.append(header, divider, stats, access);
    container.append(card);
  });
}

function orgStat(label, value) {
  const item = document.createElement("span");
  item.className = "org-stat";
  const strong = document.createElement("strong");
  strong.textContent = value;
  const small = document.createElement("small");
  small.textContent = label;
  item.append(strong, small);
  return item;
}

async function loadOrganizationPage() {
  const orgId = getQueryParam("id");
  if (!orgId) { showOrganizationAccess("Organização não informada."); return; }

  setApiStatus("Sincronizando");
  const [orgResult, projectsPayload, membersPayload] = await Promise.all([
    apiRequest(`/organizations/${encodeURIComponent(orgId)}`).catch((e) => {
      if (isAuthFailure(e)) throw e; return null;
    }),
    apiRequest(`/organizations/${encodeURIComponent(orgId)}/projects`).catch((e) => {
      if (isAuthFailure(e)) throw e; return [];
    }),
    apiRequest(`/organizations/${encodeURIComponent(orgId)}/members`).catch((e) => {
      if (isAuthFailure(e)) throw e; return null;
    }),
  ]);

  appState.organization = orgResult
    ? normalizeOrganizationDetail(orgResult, orgId)
    : fallbackOrganizationDetail(null, orgId);

  const richMembers = normalizeList(membersPayload).map(normalizeMember);
  if (richMembers.length > 0) appState.organization.members = richMembers;

  appState.membership = findCurrentMembership(appState.organization.members);
  appState.projects = normalizeList(projectsPayload).map(normalizeProject);

  renderOrganizationPage();
  setApiStatus("API pronta");
}

function renderOrganizationPage() {
  const org = appState.organization;
  const membership = appState.membership;

  if (!org) { showOrganizationAccess("Organização não encontrada."); return; }

  setText("#org-title", org.name);
  setText("#org-subtitle", org.description || "");
  setText("#role-chip", membership ? membership.role : "Sem acesso");
  setText("#members-stat", String(org.members.length));
  setText("#projects-stat", String(appState.projects.length));

  const orgImg = $("#org-header-img");
  if (orgImg) {
    if (org.image_url) {
      orgImg.src = org.image_url;
      orgImg.classList.remove("is-hidden");
    } else {
      orgImg.classList.add("is-hidden");
    }
  }

  const canManage = canManageOrganization(membership);
  $("#delete-org-button")?.classList.toggle("is-hidden", !isOwner(membership));
  $("#edit-org-button")?.classList.toggle("is-hidden", !canManage);
  setFormEnabled("#project-form", canManage);
  setFormEnabled("#org-edit-form", canManage);
  setFormEnabled("#invite-section", canManage);

  if (!membership) { showOrganizationAccess("Você ainda não faz parte dessa organização."); return; }

  $("#org-access-panel")?.classList.add("is-hidden");
  $("#org-content")?.classList.remove("is-hidden");
  renderMembersList($("#members-list"), org.members);
  renderProjectsList($("#project-list"), appState.projects, org.id);
}

function showOrganizationAccess(message) {
  $("#org-content")?.classList.add("is-hidden");
  setFormEnabled("#project-form", false);
  setFormEnabled("#invite-section", false);
  const panel = $("#org-access-panel");
  if (panel) {
    panel.classList.remove("is-hidden");
    const t = panel.querySelector("h2");
    if (t) t.textContent = message;
  }
}

function renderMembersList(container, members) {
  if (!container) return;
  clearNode(container);
  if (!members.length) { container.append(emptyMessage("Sem membros.")); return; }
  const canEdit = canManageOrganization(appState.membership);
  members.forEach((m) => container.append(createMemberLine(m, { canEdit: canEdit && m.role !== "owner" })));
}

function renderProjectsList(container, projects, orgId) {
  if (!container) return;
  clearNode(container);
  if (!projects.length) { container.append(emptyMessage("Sem projetos.")); return; }
  projects.forEach((p, i) => container.append(createProjectRow(p, { orgId, index: i })));
}

// ── Project page ──────────────────────────────────────────

async function loadProjectPage() {
  const projectId = getQueryParam("id");
  if (!projectId) { showProjectAccess("Projeto não informado."); return; }

  setApiStatus("Sincronizando");
  const projectPayload = await apiRequest(`/projects/${encodeURIComponent(projectId)}`).catch((e) => {
    if (isAuthFailure(e)) throw e;
    return { data: { id: projectId, name: "Projeto", org_id: getQueryParam("org") } };
  });

  appState.project = normalizeProjectDetail(projectPayload, projectId);
  const orgId = getQueryParam("org") || appState.project.org_id;

  if (orgId) {
    const orgPayload = await apiRequest(`/organizations/${encodeURIComponent(orgId)}`).catch((e) => {
      if (isAuthFailure(e)) throw e; return null;
    });
    appState.organization = orgPayload
      ? normalizeOrganizationDetail(orgPayload, orgId)
      : fallbackOrganizationDetail(null, orgId);
    appState.membership = findCurrentMembership(appState.organization.members);
  }

  const tasksPage = await fetchTasksPage(projectId).catch((e) => {
    if (isAuthFailure(e)) throw e;
    return { tasks: [], next_cursor: null };
  });
  appState.tasks = tasksPage.tasks;
  appState.taskNextCursor = tasksPage.next_cursor;

  renderProjectPage();
  setApiStatus("API pronta");
}

async function loadMoreTasks() {
  const projectId = getQueryParam("id");
  if (!projectId || !appState.taskNextCursor) return;

  const tasksPage = await fetchTasksPage(projectId, appState.taskNextCursor);
  appState.tasks = appState.tasks.concat(tasksPage.tasks);
  appState.taskNextCursor = tasksPage.next_cursor;
  renderProjectPage();
}

async function fetchTasksPage(projectId, cursor = null) {
  const params = new URLSearchParams({ limit: String(appState.taskLimit) });
  if (cursor?.created_at && cursor?.id) {
    params.set("cursor_created_at", cursor.created_at);
    params.set("cursor_id", cursor.id);
  }

  const payload = await apiRequest(`/projects/${encodeURIComponent(projectId)}/tasks?${params.toString()}`);
  const pageData = normalizeTasksPage(payload);
  pageData.tasks = pageData.tasks.map((task) => normalizeTask(task, appState.project || {}));
  return pageData;
}

function renderProjectPage() {
  const project = appState.project;
  const org = appState.organization;
  const membership = appState.membership;

  if (!project) { showProjectAccess("Projeto não encontrado."); return; }

  $("#project-access-panel")?.classList.add("is-hidden");
  $("#project-content")?.classList.remove("is-hidden");
  setText("#project-title", project.name);
  setText("#project-subtitle", org ? `Projeto em ${org.name}.` : "");
  setText("#tasks-stat", String(appState.tasks.length));
  setText("#project-completed-stat", `${formatProgress(project.progress ?? 0)}%`);
  setText("#project-org-stat", org?.name || shortId(project.org_id));

  const orgLink = $("#org-nav-link");
  if (orgLink && (project.org_id || org?.id)) {
    orgLink.href = `./organization.html?id=${encodeURIComponent(project.org_id || org.id)}`;
    orgLink.classList.remove("is-hidden");
  }

  setFormEnabled("#task-form", Boolean(membership));
  renderProjectTasks($("#task-list"), appState.tasks, {
    canEdit: Boolean(membership),
    canDelete: canManageOrganization(membership),
  });
  renderTaskPagination();
}

function renderTaskPagination() {
  const button = $("#load-more-tasks");
  if (!button) return;
  button.classList.toggle("is-hidden", !appState.taskNextCursor);
}

function showProjectAccess(message) {
  $("#project-content")?.classList.add("is-hidden");
  setFormEnabled("#task-form", false);
  const panel = $("#project-access-panel");
  if (panel) {
    panel.classList.remove("is-hidden");
    const t = panel.querySelector("h2");
    if (t) t.textContent = message;
  }
}

// ── Task page ─────────────────────────────────────────────

async function loadTaskPage() {
  const taskId = getQueryParam("id");
  if (!taskId) { showTaskAccess("Tarefa não informada."); return; }

  setApiStatus("Sincronizando");
  const taskPayload = await apiRequest(`/tasks/${encodeURIComponent(taskId)}`).catch((e) => {
    if (isAuthFailure(e)) throw e; return null;
  });

  if (!taskPayload) { showTaskAccess("Tarefa não encontrada."); return; }

  appState.task = normalizeTask(readData(taskPayload));

  const orgId = getQueryParam("org");
  const projectId = stringify(appState.task.project_id) || getQueryParam("project");

  if (orgId) {
    const orgPayload = await apiRequest(`/organizations/${encodeURIComponent(orgId)}`).catch((e) => {
      if (isAuthFailure(e)) throw e; return null;
    });
    appState.organization = orgPayload
      ? normalizeOrganizationDetail(orgPayload, orgId)
      : fallbackOrganizationDetail(null, orgId);
    appState.membership = findCurrentMembership(appState.organization.members);
  }

  if (projectId) {
    const link = $("#project-nav-link");
    if (link) {
      link.href = `./project.html?id=${encodeURIComponent(projectId)}${orgId ? `&org=${encodeURIComponent(orgId)}` : ""}`;
      link.classList.remove("is-hidden");
    }
  }
  if (orgId) {
    const link = $("#org-nav-link");
    if (link) {
      link.href = `./organization.html?id=${encodeURIComponent(orgId)}`;
      link.classList.remove("is-hidden");
    }
  }

  renderTaskPage();
  setApiStatus("API pronta");
}

function renderTaskPage() {
  const task = appState.task;
  const membership = appState.membership;
  if (!task) { showTaskAccess("Tarefa não encontrada."); return; }

  $("#task-access-panel")?.classList.add("is-hidden");
  $("#task-content")?.classList.remove("is-hidden");
  setText("#task-title", task.name || "Tarefa");
  setText("#task-subtitle", task.project_name ? `Projeto: ${task.project_name}` : "");
  setText("#task-priority-stat", priorityLabel(task.priority) || "—");
  setText("#task-project-stat", task.project_name || shortId(task.project_id));
  setText("#task-completed-stat", isTaskDone(task) ? "Concluída" : "Pendente");
  setText("#task-date-stat", task.created_at ? formatDate(task.created_at) : "—");
  setText("#task-description", task.description || "Sem descrição.");
  setText("#task-status-chip", priorityLabel(task.priority) || "—");

  const actionsPanel = $("#task-actions-panel");
  if (membership) {
    actionsPanel?.classList.remove("is-hidden");
    const btn = $("#complete-task-btn");
    if (btn) {
      btn.disabled = isTaskDone(task);
      btn.textContent = isTaskDone(task) ? "Já concluída" : "Concluir tarefa";
    }
    $("#delete-task-btn")?.classList.toggle("is-hidden", !canManageOrganization(membership));
  } else {
    actionsPanel?.classList.add("is-hidden");
  }
}

function showTaskAccess(message) {
  $("#task-content")?.classList.add("is-hidden");
  const panel = $("#task-access-panel");
  if (panel) {
    panel.classList.remove("is-hidden");
    const t = panel.querySelector("h2");
    if (t) t.textContent = message;
  }
}

// ── Profile page ──────────────────────────────────────────

async function loadProfilePage() {
  const username = getQueryParam("u");
  if (!username) { showProfileAccess("Usuário não informado."); return; }

  setApiStatus("Sincronizando");

  // Busca por username aproximado e acha o match exato
  const searchPayload = await apiRequest(`/users/${encodeURIComponent(username)}`).catch((e) => {
    if (isAuthFailure(e)) throw e; return null;
  });

  const results = readData(searchPayload);
  const list = Array.isArray(results) ? results : [];
  const found = list.find((u) => u.username.toLowerCase() === username.toLowerCase());

  if (!found) { showProfileAccess("Usuário não encontrado."); return; }

  // Busca dados completos pelo ID
  const userPayload = await apiRequest(`/users?id=${encodeURIComponent(found.id)}`).catch((e) => {
    if (isAuthFailure(e)) throw e; return null;
  });

  if (!userPayload) { showProfileAccess("Usuário não encontrado."); return; }

  appState.profile = readData(userPayload);
  renderProfilePage();
  setApiStatus("API pronta");
}

function renderProfilePage() {
  const profile = appState.profile;
  if (!profile) return;

  const isSelf = stringify(appState.user?.id) === stringify(profile.id);

  $("#profile-content")?.classList.remove("is-hidden");
  $("#profile-access-panel")?.classList.add("is-hidden");
  setText("#profile-username", profile.username || "Usuário");
  setText("#profile-date", profile.created_at ? `Membro desde ${formatDate(profile.created_at)}` : "");

  const avatarEl = $("#profile-avatar");
  if (avatarEl) {
    avatarEl.querySelectorAll("img.avatar-img, .avatar-initials").forEach((el) => el.remove());
    if (profile.pfp_url) {
      const img = document.createElement("img");
      img.src = profile.pfp_url;
      img.alt = profile.username;
      img.className = "avatar-img";
      avatarEl.prepend(img);
    } else {
      const span = document.createElement("span");
      span.className = "avatar-initials";
      span.textContent = initials(profile.username || "U");
      avatarEl.prepend(span);
    }
  }

  $("#profile-self-panel")?.classList.toggle("is-hidden", !isSelf);
  if (isSelf) {
    const input = $("#profile-edit-username");
    if (input) input.value = profile.username || "";
  }

  const orgsList = $("#profile-orgs-list");
  if (orgsList) {
    clearNode(orgsList);
    const orgs = Array.isArray(profile.orgs_user_is_member) ? profile.orgs_user_is_member : [];
    if (!orgs.length) {
      orgsList.append(emptyMessage("Sem organizações."));
    } else {
      orgs.forEach((org) => {
        const card = document.createElement("article");
        card.className = "org-profile-card";

        const imgEl = document.createElement("span");
        imgEl.className = "org-profile-avatar";
        if (org.image_url) {
          const img = document.createElement("img");
          img.src = org.image_url;
          img.alt = org.name;
          img.className = "avatar-img";
          imgEl.append(img);
        } else {
          imgEl.textContent = initials(org.name || "O");
        }

        const name = document.createElement("strong");
        name.textContent = org.name || "Organização";
        card.append(imgEl, name);
        orgsList.append(card);
      });
    }
  }
}

function showProfileAccess(message) {
  $("#profile-content")?.classList.add("is-hidden");
  const panel = $("#profile-access-panel");
  if (panel) {
    panel.classList.remove("is-hidden");
    const t = panel.querySelector("h2");
    if (t) t.textContent = message;
  }
}

// ── Render helpers ────────────────────────────────────────

function renderProjectTasks(container, tasks, options) {
  if (!container) return;
  clearNode(container);
  if (!tasks.length) { container.append(emptyMessage("Sem tarefas neste projeto.")); return; }
  tasks.forEach((task) => container.append(createTaskRow(task, options)));
}

function createProjectRow(project, { orgId, index = 0 }) {
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
  const pct = project.progress != null ? Number(project.progress) : 0;
  fill.style.width = `${clamp(pct, 0, 100)}%`;
  progress.append(fill);

  const percent = document.createElement("strong");
  percent.textContent = `${formatProgress(pct)}%`;

  link.append(icon, title, progress, percent);
  return link;
}

function createMemberLine(member, { canEdit = false } = {}) {
  const row = document.createElement("article");
  row.className = "member-line";

  const avatar = document.createElement("span");
  avatar.className = "avatar";
  if (member.pfp_url) {
    const img = document.createElement("img");
    img.src = member.pfp_url;
    img.alt = member.username;
    img.className = "avatar-img";
    avatar.append(img);
  } else {
    avatar.textContent = initials(member.username);
  }

  const title = document.createElement("span");
  title.className = "row-title";
  const name = document.createElement("a");
  name.className = "member-profile-link";
  name.href = `./profile.html?u=${encodeURIComponent(member.username)}`;
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

function createTaskRow(task, { compact = false } = {}) {
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

  const due = document.createElement("span");
  due.className = "muted";
  due.textContent = task.created_at ? `Criada ${formatDate(task.created_at)}` : "";

  const priority = document.createElement("span");
  priority.className = `tag ${priorityClass(task.priority)}`;
  priority.textContent = priorityLabel(task.priority);

  row.append(check, main, due, priority);

  if (!compact && task.id) {
    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "ghost-button";
    viewBtn.textContent = "Ver";
    viewBtn.addEventListener("click", () => { location.href = buildTaskUrl(task); });
    row.append(viewBtn);
  }

  return row;
}

function buildTaskUrl(task) {
  const orgId = appState.organization?.id || getQueryParam("org");
  const projectId = task.project_id || getQueryParam("id");
  const params = new URLSearchParams({ id: task.id });
  if (projectId) params.set("project", projectId);
  if (orgId) params.set("org", orgId);
  return `./task.html?${params.toString()}`;
}

// ── Handlers ──────────────────────────────────────────────

async function handleOrganizationSearch() {
  const input = $("#org-search-input");
  const name = input?.value.trim();
  if (!name) {
    renderOrgCards(appState.organizations, { label: "Todas" });
    return;
  }

  await runWithStatus($("#org-search-btn"), async () => {
    const params = new URLSearchParams({ name });
    const payload = await apiRequest(`/organizations/search?${params.toString()}`);
    const orgs = await enrichOrganizations(normalizeList(payload).map(normalizeOrganization));
    renderOrgCards(orgs, { label: `Busca: ${name}` });
  });
}

async function enrichOrganizations(orgs) {
  return Promise.all(orgs.map(enrichOrganization));
}

async function enrichOrganization(org) {
  const detailPayload = await apiRequest(`/organizations/${encodeURIComponent(org.id)}`).catch((e) => {
    if (isAuthFailure(e)) throw e;
    return null;
  });
  const detail = detailPayload ? normalizeOrganizationDetail(detailPayload, org.id) : null;
  const projects = detail?.projects || [];
  const openTasksCount = await countOpenTasksForProjects(projects);
  const projectDates = projects.map((p) => p.created_at).filter(Boolean);
  const lastActivity = latestDate([detail?.created_at, org.created_at, ...projectDates]);

  return {
    ...org,
    ...detail,
    id: org.id || detail?.id,
    name: detail?.name || org.name,
    image_url: detail?.image_url || org.image_url,
    members_count: detail?.members?.length ?? org.members_count,
    open_tasks_count: openTasksCount,
    last_activity: lastActivity,
  };
}

async function countOpenTasksForProjects(projects) {
  const counts = await Promise.all(projects.map(async (project) => {
    const tasks = await fetchAllTasksForProject(project.id);
    return tasks.filter((task) => !isTaskDone(task)).length;
  }));
  return counts.reduce((total, count) => total + count, 0);
}

async function fetchAllTasksForProject(projectId) {
  const tasks = [];
  let cursor = null;
  do {
    const pageData = await fetchTasksPage(projectId, cursor).catch((e) => {
      if (isAuthFailure(e)) throw e;
      return { tasks: [], next_cursor: null };
    });
    tasks.push(...pageData.tasks);
    cursor = pageData.next_cursor;
  } while (cursor);
  return tasks;
}

async function handleCreateOrganization(event) {
  event.preventDefault();
  const nameInput = $("#org-name-input");
  const descInput = $("#org-description-input");
  const imgInput = $("#org-img-input");
  const name = nameInput?.value.trim();
  const description = descInput?.value.trim();
  if (!name || !description) return;

  await runWithStatus(event.submitter, async () => {
    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", description);
    if (imgInput?.files?.[0]) formData.append("img", imgInput.files[0]);

    const payload = await apiRequest("/organizations", { method: "POST", body: formData });
    const data = readData(payload);
    const orgId = stringify(data.org_id || data.id);
    toast("Organização criada.", "success");
    nameInput.value = "";
    if (descInput) descInput.value = "";
    if (imgInput) imgInput.value = "";
    if (orgId) goTo(`organization.html?id=${encodeURIComponent(orgId)}`);
    else await loadDashboard();
  });
}

async function handleUserSearch() {
  const input = $("#user-search-input");
  const query = input?.value.trim();
  const results = $("#user-search-results");
  if (!query || !results) return;

  await runWithStatus($("#user-search-btn"), async () => {
    const payload = await apiRequest(`/users/${encodeURIComponent(query)}`);
    const list = Array.isArray(readData(payload)) ? readData(payload) : [];
    renderUserSearchResults(results, list);
  });
}

function renderUserSearchResults(container, users) {
  container.classList.remove("is-hidden");
  clearNode(container);

  if (!users.length) {
    const msg = document.createElement("p");
    msg.className = "empty-copy";
    msg.textContent = "Nenhum usuário encontrado.";
    container.append(msg);
    return;
  }

  users.forEach((user) => {
    const link = document.createElement("a");
    link.className = "user-search-row";
    link.href = `./profile.html?u=${encodeURIComponent(user.username)}`;

    const avatar = document.createElement("span");
    avatar.className = "avatar avatar-sm";
    if (user.pfp_url) {
      const img = document.createElement("img");
      img.src = user.pfp_url;
      img.alt = user.username;
      img.className = "avatar-img";
      avatar.append(img);
    } else {
      avatar.textContent = initials(user.username);
    }

    const name = document.createElement("strong");
    name.textContent = user.username;

    link.append(avatar, name);
    container.append(link);
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
    const list = Array.isArray(readData(payload)) ? readData(payload) : [];
    renderInviteResult(resultBox, list);
  });
}

function renderInviteResult(container, users) {
  container.classList.remove("is-hidden");
  clearNode(container);

  if (!users.length) {
    const err = document.createElement("p");
    err.className = "invite-result-error";
    err.textContent = "Nenhum usuário encontrado.";
    container.append(err);
    return;
  }

  users.forEach((user) => {
    const row = document.createElement("div");
    row.className = "invite-user-row";

    const avatar = document.createElement("span");
    avatar.className = "avatar avatar-sm";
    if (user.pfp_url) {
      const img = document.createElement("img");
      img.src = user.pfp_url;
      img.alt = user.username;
      img.className = "avatar-img";
      avatar.append(img);
    } else {
      avatar.textContent = initials(user.username);
    }

    const name = document.createElement("strong");
    name.className = "invite-result-name";
    name.textContent = user.username;

    const send = document.createElement("button");
    send.type = "button";
    send.className = "ghost-button";
    send.textContent = "Convidar";
    send.addEventListener("click", () => handleSendInvite(stringify(user.id), send));

    row.append(avatar, name, send);
    container.append(row);
  });
}

async function handleSendInvite(userId, button) {
  const orgId = getQueryParam("id");
  if (!userId || !orgId) return;

  await runWithStatus(button, async () => {
    await apiRequest(`/organizations/${encodeURIComponent(orgId)}/invite`, {
      method: "POST",
      body: { user_invited_id: userId },
    });
    const input = $("#invite-username-search");
    if (input) input.value = "";
    $("#invite-result")?.classList.add("is-hidden");
    toast("Convite enviado.", "success");
  });
}

function openMemberEditDialog(member) {
  appState.editingMemberId = member.member_id;
  setText("#member-edit-username", member.username);
  const sel = $("#member-edit-role");
  if (sel) sel.value = member.role;
  $("#member-edit-dialog")?.showModal();
}

function closeMemberEditDialog() {
  const d = $("#member-edit-dialog");
  if (d?.open) d.close();
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
  const orgId = getQueryParam("id");
  if (!name || !orgId) return;

  await runWithStatus(event.submitter, async () => {
    const payload = await apiRequest(`/organizations/${encodeURIComponent(orgId)}/projects`, {
      method: "POST",
      body: { name },
    });
    const data = readData(payload);
    const projectId = stringify(data.id || data.project_id);
    toast("Projeto criado.", "success");
    if (projectId) goTo(`project.html?id=${encodeURIComponent(projectId)}&org=${encodeURIComponent(orgId)}`);
    else { input.value = ""; await loadOrganizationPage(); }
  });
}

async function handleDeleteOrganization() {
  const org = appState.organization;
  if (!org?.id) return;

  const confirmed = await confirmAction({
    title: "Excluir organização",
    message: `Excluir "${org.name}"?`,
    actionText: "Excluir",
  });
  if (!confirmed) return;

  await runWithStatus($("#delete-org-button"), async () => {
    await apiRequest(`/organizations/${encodeURIComponent(org.id)}`, { method: "DELETE" });
    toast("Organização excluída.", "success");
    goTo("dashboard.html");
  });
}

async function handleEditOrganization(event) {
  event.preventDefault();
  const org = appState.organization;
  if (!org?.id) return;

  const nameInput = $("#org-edit-name");
  const descInput = $("#org-edit-description");
  const imgInput = $("#org-edit-img");
  const name = nameInput?.value.trim();
  const description = descInput?.value.trim();
  const img = imgInput?.files?.[0];
  if (!name && !description && !img) return;

  await runWithStatus(event.submitter, async () => {
    const formData = new FormData();
    if (name) formData.append("name", name);
    if (description) formData.append("description", description);
    if (img) formData.append("img", img);

    await apiRequest(`/organizations/${encodeURIComponent(org.id)}`, { method: "PATCH", body: formData });
    toast("Organização atualizada.", "success");
    await loadOrganizationPage();
  });
}

async function handleRemoveOrgImage() {
  const org = appState.organization;
  if (!org?.id) return;

  const confirmed = await confirmAction({
    title: "Remover imagem",
    message: "Remover a imagem da organização?",
    actionText: "Remover",
  });
  if (!confirmed) return;

  await runWithStatus($("#remove-org-img-btn"), async () => {
    await apiRequest(`/organizations/${encodeURIComponent(org.id)}/remove-img`, { method: "DELETE" });
    toast("Imagem removida.", "success");
    await loadOrganizationPage();
  });
}

async function handleCreateTask(event) {
  event.preventDefault();
  const nameInput = $("#task-name-input");
  const descInput = $("#task-description-input");
  const priorityInput = $("#task-priority-input");
  const name = nameInput?.value.trim();
  const description = descInput?.value.trim();
  const priority = priorityInput?.value || "normal";
  const projectId = getQueryParam("id");
  if (!name || !description || !projectId) return;

  await runWithStatus(event.submitter, async () => {
    await apiRequest(`/projects/${encodeURIComponent(projectId)}/tasks`, {
      method: "POST",
      body: { name, description, priority },
    });
    nameInput.value = "";
    if (descInput) descInput.value = "";
    if (priorityInput) priorityInput.value = "normal";
    toast("Tarefa adicionada.", "success");
    await loadProjectPage();
  });
}

function openTaskEditDialog(task) {
  appState.editingTaskId = task.id;
  const d = $("#task-edit-dialog");
  const nameEl = $("#task-edit-name");
  const descEl = $("#task-edit-description");
  const prioEl = $("#task-edit-priority");
  if (nameEl) nameEl.value = task.name || "";
  if (descEl) descEl.value = task.description || "";
  if (prioEl) prioEl.value = task.priority || "normal";
  d?.showModal();
}

function closeTaskEditDialog() {
  const d = $("#task-edit-dialog");
  if (d?.open) d.close();
  appState.editingTaskId = "";
}

async function handleEditTask(event) {
  event.preventDefault();
  const taskId = appState.editingTaskId;
  const name = $("#task-edit-name")?.value.trim();
  const description = $("#task-edit-description")?.value.trim();
  const priority = $("#task-edit-priority")?.value || "normal";
  if (!taskId || !name || !description) return;

  await runWithStatus(event.submitter, async () => {
    await apiRequest(`/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: { name, description, priority },
    });
    closeTaskEditDialog();
    toast("Tarefa atualizada.", "success");
    if (page === "task") await loadTaskPage();
    else await loadProjectPage();
  });
}

async function handleCompleteTask(task, button) {
  if (!task?.id) return;
  await runWithStatus(button, async () => {
    await apiRequest(`/tasks/${encodeURIComponent(task.id)}/complete`);
    toast("Tarefa concluída.", "success");
    if (page === "task") await loadTaskPage();
    else await loadProjectPage();
  });
}

async function handleDeleteTask(task) {
  const confirmed = await confirmAction({
    title: "Excluir tarefa",
    message: `Remover "${task.name}"?`,
    actionText: "Excluir",
  });
  if (!confirmed) return;

  await runWithStatus(null, async () => {
    await apiRequest(`/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
    toast("Tarefa excluída.", "success");
    if (page === "task") {
      const params = new URLSearchParams();
      const projectId = getQueryParam("project");
      const orgId = getQueryParam("org");
      if (projectId) params.set("id", projectId);
      if (orgId) params.set("org", orgId);
      goTo(`./project.html?${params.toString()}`);
    } else {
      await loadProjectPage();
    }
  });
}

async function handleUploadPfp(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const username = appState.user?.username;
  if (!username) return;

  const formData = new FormData();
  formData.append("img", file);

  await runWithStatus(null, async () => {
    const payload = await apiRequest(`/users/${encodeURIComponent(username)}`, {
      method: "PATCH",
      body: formData,
    });
    const data = readData(payload);
    appState.user = { ...appState.user, pfp_url: data.pfp_url || "" };
    localStorage.setItem(storageKeys.user, JSON.stringify(appState.user));
    renderCurrentUserAvatar();
    toast("Foto atualizada.", "success");
  });
}

async function handleRemovePfp() {
  const confirmed = await confirmAction({
    title: "Remover foto",
    message: "Remover sua foto de perfil?",
    actionText: "Remover",
  });
  if (!confirmed) return;

  await runWithStatus($("#remove-pfp-btn"), async () => {
    await apiRequest("/users/remove-pfp", { method: "DELETE" });
    appState.user = { ...appState.user, pfp_url: "" };
    localStorage.setItem(storageKeys.user, JSON.stringify(appState.user));
    renderCurrentUserAvatar();
    toast("Foto removida.", "success");
  });
}

async function handleEditProfile(event) {
  event.preventDefault();
  const username = getQueryParam("u");
  const newUsername = $("#profile-edit-username")?.value.trim();
  const imgInput = $("#profile-pfp-input") || $("#pfp-upload-input");
  const img = imgInput?.files?.[0];
  if (!newUsername && !img) return;

  await runWithStatus(event.submitter, async () => {
    const formData = new FormData();
    if (newUsername) formData.append("username", newUsername);
    if (img) formData.append("img", img);

    const payload = await apiRequest(`/users/${encodeURIComponent(username)}`, {
      method: "PATCH",
      body: formData,
    });
    const data = readData(payload);
    appState.user = { ...appState.user, username: data.username, pfp_url: data.pfp_url || "" };
    appState.profile = { ...appState.profile, username: data.username, pfp_url: data.pfp_url || "" };
    localStorage.setItem(storageKeys.user, JSON.stringify(appState.user));
    renderSessionLabels();
    renderProfilePage();
    toast("Perfil atualizado.", "success");

    if (newUsername && newUsername !== username) {
      const url = new URL(location.href);
      url.searchParams.set("u", newUsername);
      history.replaceState(null, "", url.toString());
    }
  });
}

// ── Avatar / session ──────────────────────────────────────

function renderCurrentUserAvatar() {
  const user = appState.user;
  document.querySelectorAll("[data-current-avatar]").forEach((el) => {
    el.querySelectorAll("img.avatar-img").forEach((img) => img.remove());
    if (user?.pfp_url) {
      const img = document.createElement("img");
      img.src = user.pfp_url;
      img.alt = user.username || "";
      img.className = "avatar-img";
      el.prepend(img);
      el.querySelectorAll(".avatar-initials").forEach((s) => s.remove());
    } else {
      if (!el.querySelector(".avatar-initials")) {
        const span = document.createElement("span");
        span.className = "avatar-initials";
        span.textContent = initials(user?.username || "U");
        el.prepend(span);
      }
    }
  });
}

function initPfpUpload() {
  document.querySelectorAll("[data-current-avatar]").forEach((el) => {
    el.addEventListener("click", () => {
      const input = el.closest(".avatar-upload-wrap")?.querySelector("input[type=file]");
      input?.click();
    });
  });
  document.querySelectorAll("#pfp-upload-input").forEach((input) => {
    input.addEventListener("change", handleUploadPfp);
  });
}

function renderSessionLabels() {
  const username = appState.user?.username || "Usuário";
  document.querySelectorAll("[data-current-user]").forEach((node) => {
    node.textContent = username;
  });
  document.querySelectorAll("[data-current-profile-link]").forEach((node) => {
    node.href = `./profile.html?u=${encodeURIComponent(username)}`;
  });
  renderCurrentUserAvatar();
}

// ── API ───────────────────────────────────────────────────

function bindCommonControls() {
  const apiBaseInput = $("#api-base-input");
  if (apiBaseInput) apiBaseInput.value = getApiBase();

  $("#save-api-base")?.addEventListener("click", () => {
    const next = normalizeApiBase(apiBaseInput?.value);
    localStorage.setItem(storageKeys.apiBase, next);
    if (apiBaseInput) apiBaseInput.value = next;
    toast("Conexão salva.", "success");
  });

  document.querySelectorAll("[data-logout]").forEach((btn) => btn.addEventListener("click", logout));
}

async function apiRequest(path, options = {}) {
  const url = `${getApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(options.headers || {});
  const isFormData = options.body instanceof FormData;

  if (options.body !== undefined && !isFormData) {
    headers.set("Content-Type", "application/json");
  }
  if (!options.skipAuth && appState.token) {
    headers.set("Authorization", `Bearer ${appState.token}`);
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: isFormData ? options.body : options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const payload = await parseResponse(response);

  if (!response.ok) {
    const error = new Error(extractErrorMessage(payload, response.status));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}

function extractErrorMessage(payload, status) {
  return payload?.error?.message
    || payload?.error?.messsage
    || payload?.msg
    || payload?.message
    || `Requisição falhou com status ${status}.`;
}

// ── Normalizers ───────────────────────────────────────────

function normalizeList(payload) {
  const data = readData(payload);
  if (Array.isArray(data)) return data;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(data.items)) return data.items;
  return [];
}

function normalizeTasksPage(payload) {
  const data = readData(payload);
  const tasks = Array.isArray(data.tasks) ? data.tasks : normalizeList(payload);
  return {
    tasks,
    next_cursor: data.next_cursor || null,
  };
}

function normalizeOrganization(raw) {
  return {
    id: stringify(raw.id || raw.org_id),
    name: stringify(raw.name || raw.org_name || "Organização"),
    description: stringify(raw.description || ""),
    image_url: stringify(raw.image_url || ""),
  };
}

function normalizeOrganizationDetail(payload, fallbackId) {
  const data = readData(payload);
  return {
    id: stringify(data.id || data.org_id || fallbackId),
    name: stringify(data.name || data.org_name || "Organização"),
    description: stringify(data.description || ""),
    image_url: stringify(data.image_url || ""),
    members: Array.isArray(data.members) ? data.members.map(normalizeMember) : [],
    projects: Array.isArray(data.projects) ? data.projects.map(normalizeProject) : [],
    created_at: stringify(data.created_at || ""),
  };
}

function fallbackOrganizationDetail(summary, fallbackId) {
  return {
    id: stringify(summary?.id || fallbackId),
    name: stringify(summary?.name || "Organização"),
    description: stringify(summary?.description || ""),
    image_url: stringify(summary?.image_url || ""),
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
    pfp_url: stringify(raw.pfp_url || ""),
    created_at: stringify(raw.created_at || ""),
  };
}

function normalizeProject(raw) {
  return {
    id: stringify(raw.id || raw.project_id),
    name: stringify(raw.name || "Projeto"),
    org_id: stringify(raw.org_id),
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
    priority: stringify(raw.priority || ""),
    created_at: stringify(raw.created_at || ""),
    is_completed: Boolean(raw.is_completed),
    project_id: stringify(raw.project_id || project.id),
    project_name: stringify(raw.project_name || project.name || ""),
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

// ── Utilities ─────────────────────────────────────────────

function findCurrentMembership(members) {
  const userId = stringify(appState.user?.id).toLowerCase();
  const username = stringify(appState.user?.username).toLowerCase();
  return members.find((m) => {
    const mid = stringify(m.user_id).toLowerCase();
    const mname = stringify(m.username).toLowerCase();
    return (userId && mid === userId) || (username && mname === username);
  });
}

function canManageOrganization(member) {
  return ["owner", "admin"].includes(stringify(member?.role).toLowerCase());
}

function isOwner(member) {
  return stringify(member?.role).toLowerCase() === "owner";
}

function isTaskDone(task) {
  return Boolean(task?.is_completed);
}

function priorityLabel(priority) {
  const v = stringify(priority).toLowerCase();
  if (v === "very high") return "Muito alta";
  if (v === "high") return "Alta";
  if (v === "low") return "Baixa";
  if (v === "normal") return "Normal";
  return "";
}

function priorityClass(priority) {
  const v = stringify(priority).toLowerCase();
  if (v === "very high" || v === "high") return "high";
  if (v === "low") return "low";
  if (v === "normal") return "medium";
  return "";
}

function formatProgress(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
}

function relativeDateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem atividade";
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / 86400000));
  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ha 1 dia";
  if (diffDays < 30) return `Ha ${diffDays} dias`;
  return formatDate(value);
}

function latestDate(values) {
  const dates = values
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));
  if (!dates.length) return "";
  return new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString();
}

function sumOpenTasks(orgs) {
  return orgs.reduce((total, org) => total + (Number(org.open_tasks_count) || 0), 0);
}

function formatCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "0";
}

async function runWithStatus(button, task) {
  const control = button instanceof HTMLElement ? button : null;
  const originalText = control?.textContent;
  const canSwap = control?.tagName === "BUTTON" && !control.classList.contains("nav-button");
  try {
    if (control) { control.disabled = true; if (canSwap) control.textContent = "Aguarde"; }
    return await task();
  } catch (error) {
    handleError(error);
    return false;
  } finally {
    if (control) { control.disabled = false; if (originalText && canSwap) control.textContent = originalText; }
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
  const msg = stringify(error?.message).toLowerCase();
  return msg.includes("token") || msg.includes("jwt") || msg.includes("expired");
}

function saveSession(data, fallbackUsername) {
  const token = data.access_token || "";
  const user = data.user || { username: fallbackUsername };
  if (!token) throw new Error("Token de acesso não veio na resposta.");
  appState.token = token;
  appState.user = {
    id: stringify(user.id),
    username: stringify(user.username || fallbackUsername),
    pfp_url: stringify(user.pfp_url || ""),
  };
  localStorage.setItem(storageKeys.token, appState.token);
  localStorage.setItem(storageKeys.user, JSON.stringify(appState.user));
}

function logout() { clearSession(); goTo("login.html"); }

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

function getApiBase() {
  return normalizeApiBase(localStorage.getItem(storageKeys.apiBase) || defaultApiBase);
}

function normalizeApiBase(value) {
  return (value || defaultApiBase).trim().replace(/\/+$/, "");
}

function setApiStatus(text) {
  document.querySelectorAll("#api-status").forEach((n) => { n.textContent = text; });
}

function setFormEnabled(selector, enabled) {
  const form = $(selector);
  if (!form) return;
  form.querySelectorAll("input, textarea, button, select").forEach((c) => { c.disabled = !enabled; });
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
  while (node?.firstChild) node.removeChild(node.firstChild);
}

function emptyMessage(message) {
  const p = document.createElement("p");
  p.className = "empty-copy";
  p.textContent = message;
  return p;
}

async function confirmAction({ title, message, actionText }) {
  const dialog = $("#confirm-dialog");
  if (!dialog?.showModal) return window.confirm(message);
  setText("#confirm-title", title);
  setText("#confirm-message", message);
  setText("#confirm-action", actionText || "Confirmar");
  dialog.showModal();
  return new Promise((resolve) => {
    const onClose = () => { dialog.removeEventListener("close", onClose); resolve(dialog.returnValue === "confirm"); };
    dialog.addEventListener("close", onClose);
  });
}

async function copyText(text, successMessage) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast(successMessage, "success");
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
  if (replace) { window.location.replace(path); return; }
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
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}

function $(selector) { return document.querySelector(selector); }

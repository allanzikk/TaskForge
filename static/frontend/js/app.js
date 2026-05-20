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
  dashboardOrgs: [],
  invites: [],
  organization: null,
  membership: null,
  projects: [],
  project: null,
  tasks: [],
};

init();

function init() {
  bindCommonControls();
  renderSessionLabels();

  const pageInitializers = {
    redirect: initRedirect,
    login: initLogin,
    register: initRegister,
    dashboard: initDashboard,
    organization: initOrganizationPage,
    project: initProjectPage,
  };

  const initializer = pageInitializers[page] || initRedirect;
  initializer();
}

function initRedirect() {
  goTo(appState.token ? "dashboard.html" : "login.html", true);
}

function initLogin() {
  if (appState.token) {
    goTo("dashboard.html", true);
    return;
  }

  const form = $("#login-form");
  form?.addEventListener("submit", async (event) => {
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

  const form = $("#register-form");
  form?.addEventListener("submit", async (event) => {
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

  $("#refresh-dashboard")?.addEventListener("click", () => {
    runWithStatus($("#refresh-dashboard"), loadDashboard);
  });

  $("#create-org-form")?.addEventListener("submit", handleCreateOrganization);
  runWithStatus($("#refresh-dashboard"), loadDashboard);
}

function initOrganizationPage() {
  if (!requireAuth()) return;

  $("#refresh-organization")?.addEventListener("click", () => {
    runWithStatus($("#refresh-organization"), loadOrganizationPage);
  });

  $("#project-form")?.addEventListener("submit", handleCreateProject);
  $("#invite-search-btn")?.addEventListener("click", handleSearchUser);
  $("#invite-username-search")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSearchUser();
  });
  $("#delete-org-button")?.addEventListener("click", handleDeleteOrganization);
  $("#copy-org-id")?.addEventListener("click", () => {
    copyText(getQueryParam("id"), "ID da organização copiado.");
  });

  runWithStatus($("#refresh-organization"), loadOrganizationPage);
}

function initProjectPage() {
  if (!requireAuth()) return;

  $("#refresh-project")?.addEventListener("click", () => {
    runWithStatus($("#refresh-project"), loadProjectPage);
  });

  $("#task-form")?.addEventListener("submit", handleCreateTask);
  $("#copy-project-id")?.addEventListener("click", () => {
    copyText(getQueryParam("id"), "ID do projeto copiado.");
  });

  runWithStatus($("#refresh-project"), loadProjectPage);
}

function bindCommonControls() {
  const apiBaseInput = $("#api-base-input");
  const saveApiBaseButton = $("#save-api-base");

  if (apiBaseInput) {
    apiBaseInput.value = getApiBase();
  }

  saveApiBaseButton?.addEventListener("click", () => {
    const nextBase = normalizeApiBase(apiBaseInput?.value);
    localStorage.setItem(storageKeys.apiBase, nextBase);
    if (apiBaseInput) apiBaseInput.value = nextBase;
    toast("Conexão salva.", "success");
  });

  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", () => logout());
  });
}

async function loadDashboard() {
  setApiStatus("Sincronizando");

  const [orgsPayload, invitesPayload] = await Promise.all([
    apiRequest("/organizations"),
    apiRequest("/users/invites").catch(() => null),
  ]);

  const organizations = normalizeList(orgsPayload).map(normalizeOrganization);
  const detailed = await Promise.all(organizations.map(resolveDashboardOrganization));

  appState.dashboardOrgs = detailed;
  appState.invites = normalizeInvitesList(invitesPayload);

  renderDashboard();
  setApiStatus("API pronta");
}

async function resolveDashboardOrganization(org) {
  try {
    const detailPayload = await apiRequest(`/organizations/${encodeURIComponent(org.id)}`);
    const detail = normalizeOrganizationDetail(detailPayload, org.id);
    const membership = findCurrentMembership(detail.members);

    return {
      ...org,
      ...detail,
      isMember: Boolean(membership),
      role: membership?.role || "",
      memberCount: detail.members.length,
    };
  } catch (error) {
    if (isAuthFailure(error)) throw error;
    return {
      ...org,
      isMember: false,
      inaccessible: true,
      error: error.message,
      members: [],
      memberCount: 0,
    };
  }
}

function renderDashboard() {
  const myOrgs = appState.dashboardOrgs.filter((org) => org.isMember);
  const otherOrgs = appState.dashboardOrgs.filter((org) => !org.isMember);
  const invites = appState.invites || [];

  setText("#my-orgs-stat", String(myOrgs.length));
  setText("#all-orgs-stat", String(appState.dashboardOrgs.length));
  setText("#invites-stat", String(invites.length));
  renderInvitesPanel(invites);
  renderOrganizationCards($("#my-orgs-list"), myOrgs, true);
  renderOrganizationCards($("#other-orgs-list"), otherOrgs, false);
}

function renderInvitesPanel(invites) {
  const panel = $("#invites-panel");
  const list = $("#invites-list");
  if (!panel || !list) return;

  if (invites.length === 0) {
    panel.classList.add("is-hidden");
    return;
  }

  panel.classList.remove("is-hidden");
  setText("#invites-count", String(invites.length));
  clearNode(list);

  invites.forEach((invite) => {
    const card = document.createElement("article");
    card.className = "invite-card";

    const orgName = document.createElement("strong");
    orgName.className = "invite-org-name";
    orgName.textContent = invite.org_name || "Organização";

    const sender = document.createElement("p");
    sender.className = "invite-sender";
    sender.textContent = `Convidado por ${invite.member_username || "um membro"}`;

    const acceptBtn = document.createElement("button");
    acceptBtn.type = "button";
    acceptBtn.className = "primary-button invite-accept-btn";
    acceptBtn.textContent = "Aceitar";
    acceptBtn.addEventListener("click", () => handleAcceptInviteById(invite.id, card));

    card.append(orgName, sender, acceptBtn);
    list.append(card);
  });
}

function renderOrganizationCards(container, orgs, canOpen) {
  if (!container) return;
  clearNode(container);

  if (orgs.length === 0) {
    container.append(emptyMessage(canOpen
      ? "Você ainda não participa de nenhuma organização."
      : "Nenhuma organização fora da sua equipe."));
    return;
  }

  orgs.forEach((org) => {
    const card = document.createElement("article");
    card.className = "org-card";

    const title = document.createElement("h3");
    title.textContent = org.name;

    const meta = document.createElement("p");
    meta.className = "card-meta";
    meta.textContent = org.isMember
      ? `${org.memberCount || 0} membro(s) • ${org.role || "member"}`
      : org.inaccessible
        ? "Acesso não confirmado"
        : "Você não é membro";

    const action = document.createElement(org.isMember ? "a" : "span");
    action.className = org.isMember ? "primary-button as-link" : "status-chip subdued";
    action.textContent = org.isMember ? "Abrir organização" : "Fora da equipe";
    if (org.isMember) {
      action.href = `./organization.html?id=${encodeURIComponent(org.id)}`;
    }

    card.append(title, meta, action);
    container.append(card);
  });
}

async function loadOrganizationPage() {
  const orgId = getQueryParam("id");
  if (!orgId) {
    showOrganizationAccess("Organização não informada.");
    return;
  }

  setApiStatus("Sincronizando");
  const detailPayload = await apiRequest(`/organizations/${encodeURIComponent(orgId)}`);
  const organization = normalizeOrganizationDetail(detailPayload, orgId);
  const membership = findCurrentMembership(organization.members);

  appState.organization = organization;
  appState.membership = membership;
  renderOrganizationShell();

  if (!membership) {
    showOrganizationAccess("Você ainda não faz parte dessa organização.");
    setApiStatus("Sem acesso");
    return;
  }

  const projectsPayload = await apiRequest(`/organizations/${encodeURIComponent(orgId)}/projects`);
  appState.projects = normalizeList(projectsPayload).map(normalizeProject);
  renderOrganizationContent();
  setApiStatus("API pronta");
}

function renderOrganizationShell() {
  const organization = appState.organization;
  const membership = appState.membership;
  const canManage = canManageOrganization(membership);

  setText("#org-title", organization?.name || "Organização");
  setText("#role-chip", membership ? membership.role : "Sem acesso");
  $("#delete-org-button")?.classList.toggle("is-hidden", !isOwner(membership));

  setFormEnabled("#invite-section", canManage);
  setFormEnabled("#project-form", canManage);
}

function showOrganizationAccess(message) {
  setText("#org-title", appState.organization?.name || "Organização");
  const accessPanel = $("#org-access-panel");
  const content = $("#org-content");
  if (accessPanel) {
    accessPanel.classList.remove("is-hidden");
    const title = accessPanel.querySelector("h2");
    if (title) title.textContent = message;
  }
  content?.classList.add("is-hidden");
  setFormEnabled("#invite-section", false);
  setFormEnabled("#project-form", false);
}

function renderOrganizationContent() {
  const organization = appState.organization;
  const accessPanel = $("#org-access-panel");
  const content = $("#org-content");

  accessPanel?.classList.add("is-hidden");
  content?.classList.remove("is-hidden");
  setText("#members-stat", String(organization.members.length));
  setText("#projects-stat", String(appState.projects.length));
  renderMembers($("#members-list"), organization.members);
  renderProjects($("#project-list"), appState.projects, organization.id);
}

function renderMembers(container, members) {
  if (!container) return;
  clearNode(container);

  if (members.length === 0) {
    container.append(emptyMessage("Sem membros cadastrados."));
    return;
  }

  members.forEach((member) => {
    const item = document.createElement("article");
    item.className = "member-item";

    const top = document.createElement("div");
    top.className = "member-top";

    const name = document.createElement("strong");
    name.textContent = member.username || "Usuário";

    const role = document.createElement("span");
    role.className = "role-badge";
    role.textContent = member.role || "member";

    const id = document.createElement("span");
    id.textContent = member.user_id ? `ID ${shortId(member.user_id)}` : "ID indisponível";

    top.append(name, role);
    item.append(top, id);
    container.append(item);
  });
}

function renderProjects(container, projects, orgId) {
  if (!container) return;
  clearNode(container);

  if (projects.length === 0) {
    container.append(emptyMessage("Sem projetos nesta organização."));
    return;
  }

  projects.forEach((project) => {
    const link = document.createElement("a");
    link.className = "project-item as-link";
    link.href = `./project.html?id=${encodeURIComponent(project.id)}&org=${encodeURIComponent(orgId)}`;

    const name = document.createElement("strong");
    name.textContent = project.name;

    const id = document.createElement("span");
    id.textContent = shortId(project.id);

    link.append(name, id);
    container.append(link);
  });
}

async function loadProjectPage() {
  const projectId = getQueryParam("id");
  if (!projectId) {
    showProjectAccess("Projeto não informado.");
    return;
  }

  setApiStatus("Sincronizando");

  try {
    const projectPayload = await apiRequest(`/projects/${encodeURIComponent(projectId)}`);
    const project = normalizeProjectDetail(projectPayload, projectId);
    const orgId = getQueryParam("org") || project.org_id;

    appState.project = project;

    if (orgId) {
      const orgPayload = await apiRequest(`/organizations/${encodeURIComponent(orgId)}`);
      appState.organization = normalizeOrganizationDetail(orgPayload, orgId);
      appState.membership = findCurrentMembership(appState.organization.members);
    }

    const tasksPayload = await apiRequest(`/projects/${encodeURIComponent(projectId)}/tasks`);
    appState.tasks = normalizeList(tasksPayload).map(normalizeTask);
    renderProjectContent();
    setApiStatus("API pronta");
  } catch (error) {
    if (isMembershipError(error)) {
      showProjectAccess(error.message);
      setApiStatus("Sem acesso");
      return;
    }
    throw error;
  }
}

function renderProjectContent() {
  const project = appState.project;
  const organization = appState.organization;
  const membership = appState.membership;
  const canDelete = canManageOrganization(membership);

  $("#project-access-panel")?.classList.add("is-hidden");
  $("#project-content")?.classList.remove("is-hidden");
  setText("#project-title", project.name);
  setText("#tasks-stat", String(appState.tasks.length));
  setText("#project-org-stat", organization?.name || shortId(project.org_id));
  setText("#task-permission-chip", canDelete ? "Pode excluir" : "Criar tarefas");

  const orgLink = $("#org-nav-link");
  if (orgLink && project.org_id) {
    orgLink.classList.remove("is-hidden");
    orgLink.href = `./organization.html?id=${encodeURIComponent(project.org_id)}`;
    orgLink.textContent = organization?.name || "Organização";
  }

  setFormEnabled("#task-form", Boolean(membership));
  renderTasks($("#task-list"), appState.tasks, canDelete);
}

function showProjectAccess(message) {
  setText("#project-title", appState.project?.name || "Projeto");
  const accessPanel = $("#project-access-panel");
  const content = $("#project-content");
  if (accessPanel) {
    accessPanel.classList.remove("is-hidden");
    const title = accessPanel.querySelector("h2");
    if (title) title.textContent = message;
  }
  content?.classList.add("is-hidden");
  setFormEnabled("#task-form", false);
}

function renderTasks(container, tasks, canDelete) {
  if (!container) return;
  clearNode(container);

  if (tasks.length === 0) {
    container.append(emptyMessage("Sem tarefas neste projeto."));
    return;
  }

  tasks.forEach((task) => {
    const card = document.createElement("article");
    card.className = "task-card";

    const title = document.createElement("strong");
    title.textContent = task.name;

    const description = document.createElement("p");
    description.textContent = task.description || "Sem descrição.";

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const id = document.createElement("span");
    id.className = "muted";
    id.textContent = shortId(task.id);
    actions.append(id);

    if (canDelete) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger-button";
      remove.textContent = "Excluir";
      remove.addEventListener("click", () => handleDeleteTask(task));
      actions.append(remove);
    }

    card.append(title, description, actions);
    container.append(card);
  });
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
      goTo(`organization.html?id=${encodeURIComponent(orgId)}`);
    } else {
      input.value = "";
      await loadDashboard();
    }
  });
}

async function handleAcceptInviteById(inviteId, card) {
  if (!inviteId) return;

  await runWithStatus(card?.querySelector("button"), async () => {
    await apiRequest(`/invite/${encodeURIComponent(inviteId)}`);
    toast("Convite aceito! Recarregando...", "success");
    await loadDashboard();
  });
}

async function handleSearchUser() {
  const input = $("#invite-username-search");
  const username = input?.value.trim();
  if (!username) return;

  const btn = $("#invite-search-btn");
  const resultBox = $("#invite-result");
  if (!resultBox) return;

  await runWithStatus(btn, async () => {
    const payload = await apiRequest(`/users/${encodeURIComponent(username)}`);
    const data = payload?.data || payload || {};
    const userId = stringify(data.id);
    const foundUsername = stringify(data.username || username);

    if (!userId) {
      renderInviteResult(resultBox, null, null, "Usuário não encontrado.");
      return;
    }

    renderInviteResult(resultBox, foundUsername, userId);
  });
}

function renderInviteResult(container, username, userId, errorMsg) {
  container.classList.remove("is-hidden");
  container.innerHTML = "";

  if (errorMsg || !userId) {
    const msg = document.createElement("p");
    msg.className = "invite-result-error";
    msg.textContent = errorMsg || "Usuário não encontrado.";
    container.append(msg);
    return;
  }

  const nameEl = document.createElement("strong");
  nameEl.className = "invite-result-name";
  nameEl.textContent = username;

  const idEl = document.createElement("span");
  idEl.className = "invite-result-id muted";
  idEl.textContent = shortId(userId);

  const sendBtn = document.createElement("button");
  sendBtn.type = "button";
  sendBtn.className = "primary-button invite-result-send";
  sendBtn.textContent = "Convidar";
  sendBtn.addEventListener("click", () => handleSendInvite(userId, sendBtn));

  container.append(nameEl, idEl, sendBtn);
}

async function handleSendInvite(userId, btn) {
  const orgId = getQueryParam("id");
  if (!userId || !orgId) return;

  await runWithStatus(btn, async () => {
    await apiRequest(`/organizations/${encodeURIComponent(orgId)}/invite`, {
      method: "POST",
      body: { user_invited_id: userId },
    });

    const input = $("#invite-username-search");
    const resultBox = $("#invite-result");
    if (input) input.value = "";
    if (resultBox) resultBox.classList.add("is-hidden");
    toast("Convite enviado.", "success");
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
    goTo("dashboard.html");
  });
}

async function handleCreateTask(event) {
  event.preventDefault();
  const nameInput = $("#task-name-input");
  const descriptionInput = $("#task-description-input");
  const name = nameInput?.value.trim();
  const description = descriptionInput?.value.trim();
  const projectId = getQueryParam("id");

  if (!name || !description || !projectId) return;

  await runWithStatus(event.submitter, async () => {
    await apiRequest(`/projects/${encodeURIComponent(projectId)}/tasks`, {
      method: "POST",
      body: { name, description },
    });
    nameInput.value = "";
    descriptionInput.value = "";
    toast("Tarefa adicionada.", "success");
    await loadProjectPage();
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
    await loadProjectPage();
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

function readData(payload) {
  return payload?.data || payload || {};
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
  };
}

function normalizeMember(raw) {
  return {
    user_id: stringify(raw.user_id || raw.id),
    username: stringify(raw.username || "Usuário"),
    role: stringify(raw.role || "member"),
  };
}

function normalizeProject(raw) {
  return {
    id: stringify(raw.id || raw.project_id),
    name: stringify(raw.name || "Projeto"),
    org_id: stringify(raw.org_id),
  };
}

function normalizeProjectDetail(payload, fallbackId) {
  const data = readData(payload);
  return {
    id: stringify(data.id || data.project_id || fallbackId),
    name: stringify(data.name || "Projeto"),
    org_id: stringify(data.org_id),
  };
}

function normalizeTask(raw) {
  return {
    id: stringify(raw.id || raw.task_id),
    name: stringify(raw.name || "Tarefa"),
    description: stringify(raw.description || ""),
  };
}

function normalizeInvitesList(payload) {
  if (!payload) return [];
  const data = payload?.data ?? payload;
  const list = Array.isArray(data) ? data : [];
  return list.map((raw) => ({
    id: stringify(raw.id),
    org_id: stringify(raw.org_id),
    org_name: stringify(raw.org_name || "Organização"),
    member_username: stringify(raw.member_username || ""),
  }));
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

function isMembershipError(error) {
  const message = stringify(error?.message).toLowerCase();
  const code = stringify(error?.code).toLowerCase();
  return message.includes("member")
    || message.includes("access")
    || message.includes("permission")
    || code.includes("access")
    || code.includes("permission")
    || code.includes("unauthorized");
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

async function runWithStatus(button, task) {
  const control = button instanceof HTMLElement ? button : null;
  const originalText = control?.textContent;
  const canSwapText = control?.tagName === "BUTTON" && !control.classList.contains("icon-button");

  try {
    if (control) {
      control.disabled = true;
      if (originalText && canSwapText) {
        control.textContent = "Aguarde";
      }
    }
    return await task();
  } catch (error) {
    handleError(error);
    return false;
  } finally {
    if (control) {
      control.disabled = false;
      if (originalText && canSwapText) {
        control.textContent = originalText;
      }
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

  if (isMembershipError(error)) {
    toast(error.message || "Você não tem acesso a esse recurso.", "error");
    return;
  }

  toast(error?.message || "Algo deu errado.", "error");
  setApiStatus(error?.status ? `Erro ${error.status}` : "Erro");
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
}

function getApiBase() {
  return normalizeApiBase(localStorage.getItem(storageKeys.apiBase) || defaultApiBase);
}

function normalizeApiBase(value) {
  const base = (value || defaultApiBase).trim();
  return base.replace(/\/+$/, "");
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

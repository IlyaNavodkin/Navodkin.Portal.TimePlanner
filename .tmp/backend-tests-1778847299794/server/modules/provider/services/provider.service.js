"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderService = void 0;
exports.getProviderService = getProviderService;
const MOCK_MANAGERS = [
    { id: "mgr-1", name: "Руководитель 1" },
    { id: "mgr-2", name: "Руководитель 2" },
];
const MOCK_EMPLOYEES = [
    { id: "emp-1", name: "Сотрудник 1", managerId: "mgr-1" },
    { id: "emp-2", name: "Сотрудник 2", managerId: "mgr-1" },
    { id: "emp-3", name: "Сотрудник 3", managerId: "mgr-2" },
];
const MOCK_PROJECTS = [
    { id: "pr-1", name: "Проект 1" },
    { id: "pr-2", name: "Проект 2" },
];
const MOCK_CHARGES = [
    { id: "ch-1", name: "Чардж 1", projectId: "pr-1" },
    { id: "ch-2", name: "Чардж 2", projectId: "pr-1" },
    { id: "ch-3", name: "Чардж 3", projectId: "pr-2" },
];
function resolveMode(rawMode) {
    const mode = rawMode ?? "mock";
    if (mode !== "mock" && mode !== "http") {
        throw new Error(`Unsupported PROVIDER_MODE: ${mode}`);
    }
    return mode;
}
function withSearch(items, search) {
    if (!search) {
        return items;
    }
    const normalized = search.toLowerCase().trim();
    return items.filter((item) => item.name.toLowerCase().includes(normalized));
}
class ProviderService {
    mode;
    baseUrl;
    constructor(options) {
        this.mode = resolveMode(options?.mode ?? process.env.PROVIDER_MODE);
        this.baseUrl = options?.baseUrl ?? process.env.PROVIDER_BASE_URL ?? "http://localhost:4000";
    }
    async getManagers() {
        if (this.mode === "mock") {
            return MOCK_MANAGERS;
        }
        return await $fetch(`${this.baseUrl}/provider/managers`);
    }
    async getEmployeesByManager(managerId) {
        if (this.mode === "mock") {
            return MOCK_EMPLOYEES.filter((employee) => employee.managerId === managerId);
        }
        return await $fetch(`${this.baseUrl}/provider/managers/${encodeURIComponent(managerId)}/employees`);
    }
    async getProjects(search) {
        if (this.mode === "mock") {
            return withSearch(MOCK_PROJECTS, search);
        }
        return await $fetch(`${this.baseUrl}/provider/projects`, {
            query: { search },
        });
    }
    async getCharges(options) {
        if (this.mode === "mock") {
            const filteredByProject = options?.projectIds?.length
                ? MOCK_CHARGES.filter((charge) => options.projectIds?.includes(charge.projectId))
                : MOCK_CHARGES;
            return withSearch(filteredByProject, options?.search);
        }
        return await $fetch(`${this.baseUrl}/provider/charges`, {
            query: {
                projectIds: options?.projectIds,
                search: options?.search,
            },
        });
    }
}
exports.ProviderService = ProviderService;
let providerServiceSingleton = null;
function getProviderService() {
    if (!providerServiceSingleton) {
        providerServiceSingleton = new ProviderService();
    }
    return providerServiceSingleton;
}

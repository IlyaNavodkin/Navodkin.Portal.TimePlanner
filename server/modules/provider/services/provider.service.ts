type ProviderMode = "mock" | "http"

export interface ProviderManager {
  id: string
  name: string
}

export interface ProviderEmployee {
  id: string
  name: string
  managerId: string
}

export interface ProviderProject {
  id: string
  name: string
}

export interface ProviderCharge {
  id: string
  name: string
  projectId: string
}

const MOCK_MANAGERS: ProviderManager[] = [
  { id: "mgr-1", name: "Руководитель 1" },
  { id: "mgr-2", name: "Руководитель 2" },
]

const MOCK_EMPLOYEES: ProviderEmployee[] = [
  { id: "emp-1", name: "Сотрудник 1", managerId: "mgr-1" },
  { id: "emp-2", name: "Сотрудник 2", managerId: "mgr-1" },
  { id: "emp-3", name: "Сотрудник 3", managerId: "mgr-2" },
]

const MOCK_PROJECTS: ProviderProject[] = [
  { id: "pr-1", name: "Проект 1" },
  { id: "pr-2", name: "Проект 2" },
]

const MOCK_CHARGES: ProviderCharge[] = [
  { id: "ch-1", name: "Чардж 1", projectId: "pr-1" },
  { id: "ch-2", name: "Чардж 2", projectId: "pr-1" },
  { id: "ch-3", name: "Чардж 3", projectId: "pr-2" },
]

function resolveMode(rawMode: string | undefined): ProviderMode {
  const mode = rawMode ?? "mock"
  if (mode !== "mock" && mode !== "http") {
    throw new Error(`Unsupported PROVIDER_MODE: ${mode}`)
  }
  return mode
}

function withSearch<T extends { name: string }>(items: T[], search?: string): T[] {
  if (!search) {
    return items
  }

  const normalized = search.toLowerCase().trim()
  return items.filter((item) => item.name.toLowerCase().includes(normalized))
}

export class ProviderService {
  private readonly mode: ProviderMode
  private readonly baseUrl: string

  constructor(options?: { mode?: ProviderMode; baseUrl?: string }) {
    this.mode = resolveMode(options?.mode ?? process.env.PROVIDER_MODE)
    this.baseUrl = options?.baseUrl ?? process.env.PROVIDER_BASE_URL ?? "http://localhost:4000"
  }

  async getManagers(): Promise<ProviderManager[]> {
    if (this.mode === "mock") {
      return MOCK_MANAGERS
    }

    return await $fetch<ProviderManager[]>(`${this.baseUrl}/provider/managers`)
  }

  async getEmployeesByManager(managerId: string): Promise<ProviderEmployee[]> {
    if (this.mode === "mock") {
      return MOCK_EMPLOYEES.filter((employee) => employee.managerId === managerId)
    }

    return await $fetch<ProviderEmployee[]>(
      `${this.baseUrl}/provider/managers/${encodeURIComponent(managerId)}/employees`,
    )
  }

  async getProjects(search?: string): Promise<ProviderProject[]> {
    if (this.mode === "mock") {
      return withSearch(MOCK_PROJECTS, search)
    }

    return await $fetch<ProviderProject[]>(`${this.baseUrl}/provider/projects`, {
      query: { search },
    })
  }

  async getCharges(options?: { projectIds?: string[]; search?: string }): Promise<ProviderCharge[]> {
    if (this.mode === "mock") {
      const filteredByProject = options?.projectIds?.length
        ? MOCK_CHARGES.filter((charge) => options.projectIds?.includes(charge.projectId))
        : MOCK_CHARGES

      return withSearch(filteredByProject, options?.search)
    }

    return await $fetch<ProviderCharge[]>(`${this.baseUrl}/provider/charges`, {
      query: {
        projectIds: options?.projectIds,
        search: options?.search,
      },
    })
  }
}

let providerServiceSingleton: ProviderService | null = null

export function getProviderService(): ProviderService {
  if (!providerServiceSingleton) {
    providerServiceSingleton = new ProviderService()
  }

  return providerServiceSingleton
}

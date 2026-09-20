"use client";

/*
  ============================================================
  PROJECT MANAGER — página principal (app/page.tsx)
  ============================================================

  Este archivo contiene toda la aplicación:
  1. Tipos y funciones de cálculo (presupuesto, profit, close-out)
  2. Home: estado, localStorage y acciones de proyectos
  3. Sidebar + vistas: Dashboard, Projects
  4. Componentes internos: tarjetas, detalle de proyecto, estadísticas

  Los materiales se gestionan DENTRO de cada proyecto
  (CSV + alta manual). No hay una página "Materials" aparte.
  ============================================================
*/

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import CsvUploader, {
  getMaterialSignature,
  Material,
} from "../components/CsvUploader";
import ManualMaterialForm from "../components/ManualMaterialForm";
import MaterialsTable from "../components/MaterialsTable";
import BudgetChart from "../components/BudgetChart";
import MaterialCostChart from "../components/MaterialCostChart";

/*
  ============================================================
  TIPOS
  ============================================================
*/

/* Un proyecto de construcción guardado en la app. */
type Project = {
  id: number;
  name: string;
  type: string;
  budget: number;
  address: string;
  client: string;
  description: string;
  startDate: string;
  estimatedEndDate: string;
  actualEndDate: string;
  status: ProjectStatus;
  materials: Material[];
  tasks: Task[];
  expenses: Expense[];
  dailyLogs: DailyLog[];
};

type ProjectStatus = "active" | "paused" | "completed";
type TaskStatus = "pending" | "in_progress" | "completed";
type ExpenseCategory =
  | "materials"
  | "labor"
  | "subcontractors"
  | "equipment"
  | "permits"
  | "other";

type Task = {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  progress: number;
  dueDate: string;
};

type Expense = {
  id: number;
  description: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  notes: string;
};

type DailyLog = {
  id: number;
  date: string;
  title: string;
  notes: string;
  weather: string;
  workers: number;
};

function asString(value: unknown) {
  /* Lectura segura de backups: los valores no textuales se convierten en vacío. */
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown, fallback = 0) {
  /* Evita propagar NaN o infinitos desde JSON/importaciones hacia los cálculos. */
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  /* El guard permite validar la forma mínima de un objeto JSON importado. */
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeProject(value: unknown): Project {
  /*
    Compatibilidad de persistencia: reconstruye un proyecto con valores
    seguros y defaults para que datos antiguos o parcialmente editados no
    rompan el renderizado.
  */
  const project = (value ?? {}) as Partial<Project> & {
    materials?: unknown[];
    tasks?: unknown[];
    expenses?: unknown[];
    dailyLogs?: unknown[];
  };

  return {
    id: asNumber(project.id, Date.now()),
    name: asString(project.name) || "Untitled project",
    type: asString(project.type) || "Residential",
    budget: Math.max(0, asNumber(project.budget)),
    address: asString(project.address),
    client: asString(project.client),
    description: asString(project.description),
    startDate: asString(project.startDate),
    estimatedEndDate: asString(project.estimatedEndDate),
    actualEndDate: asString(project.actualEndDate),
    status:
      project.status === "completed" || project.status === "paused"
        ? project.status
        : "active",
    materials: Array.isArray(project.materials)
      ? project.materials.map((material) => {
          const item = (material ?? {}) as Partial<Material>;
          return {
            material: asString(item.material),
            category: asString(item.category) || "Uncategorized",
            unit: asString(item.unit) || "pcs",
            quantity: Math.max(0, asNumber(item.quantity)),
            unit_price: Math.max(0, asNumber(item.unit_price)),
          };
        })
      : [],
    tasks: Array.isArray(project.tasks)
      ? project.tasks.map((task, index) => {
          const item = (task ?? {}) as Partial<Task>;
          return {
            id: asNumber(item.id, Date.now() + index),
            title: asString(item.title) || "Untitled task",
            description: asString(item.description),
            status:
              item.status === "completed" || item.status === "in_progress"
                ? item.status
                : "pending",
            progress: Math.min(100, Math.max(0, asNumber(item.progress))),
            dueDate: asString(item.dueDate),
          };
        })
      : [],
    expenses: Array.isArray(project.expenses)
      ? project.expenses.map((expense, index) => {
          const item = (expense ?? {}) as Partial<Expense>;
          const categories: ExpenseCategory[] = [
            "materials",
            "labor",
            "subcontractors",
            "equipment",
            "permits",
            "other",
          ];
          return {
            id: asNumber(item.id, Date.now() + index),
            description: asString(item.description) || "Expense",
            category: categories.includes(item.category as ExpenseCategory)
              ? (item.category as ExpenseCategory)
              : "other",
            amount: Math.max(0, asNumber(item.amount)),
            date: asString(item.date),
            notes: asString(item.notes),
          };
        })
      : [],
    dailyLogs: Array.isArray(project.dailyLogs)
      ? project.dailyLogs.map((log, index) => {
          const item = (log ?? {}) as Partial<DailyLog>;
          return {
            id: asNumber(item.id, Date.now() + index),
            date: asString(item.date),
            title: asString(item.title) || "Daily log",
            notes: asString(item.notes),
            weather: asString(item.weather),
            workers: Math.max(0, asNumber(item.workers)),
          };
        })
      : [],
  };
}

function normalizeImportedProjects(value: unknown): Project[] {
  /* Acepta tanto el array histórico de localStorage como el formato de backup. */
  const projects = isRecord(value) && Array.isArray(value.projects)
    ? value.projects
    : value;

  if (!Array.isArray(projects)) {
    throw new Error("The backup must contain an array of projects.");
  }

  if (!projects.every(isRecord)) {
    throw new Error("Every backup project must be a JSON object.");
  }

  return projects.map(normalizeProject);
}

/* Costo agrupado por categoría (ej. concreto, madera). */
type CategoryCost = {
  category: string;
  cost: number;
  items: number;
  share: number;
};

/*
  ============================================================
  FUNCIONES DE CÁLCULO
  ============================================================
*/

/* Formatea un número como dinero: $1,234.56 (o negativo). */
function formatMoney(value: number) {
  const formatted = Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return value < 0 ? `-$${formatted}` : `$${formatted}`;
}

/* Suma quantity × unit_price de todos los materiales. */
function getMaterialCost(materials: Material[]) {
  return materials.reduce(
    (total, material) => total + material.quantity * material.unit_price,
    0
  );
}

function getExpenseCost(expenses: Expense[]) {
  /* Gastos de mano de obra, subcontratas, equipo, permisos y otros. */
  return expenses.reduce((total, expense) => total + expense.amount, 0);
}

function getProjectCost(project: Project) {
  /* Coste total usado en tarjetas, gráficos y cierre: materiales + gastos. */
  return getMaterialCost(project.materials) + getExpenseCost(project.expenses);
}

/*
  Estadísticas de cierre cuando el proyecto está completed.
  Profit = presupuesto del contrato − costo real de materiales.
*/
function getProjectCloseout(project: Project) {
  /* Costo real invertido en materiales. */
  const actualCost = getProjectCost(project);

  /* Lo que queda (o se pierde) respecto al presupuesto. */
  const profit = project.budget - actualCost;

  /* Profit como porcentaje del presupuesto. */
  const profitMargin =
    project.budget > 0 ? (profit / project.budget) * 100 : 0;

  /* Qué % del presupuesto ya se gastó. */
  const budgetUsed =
    project.budget > 0 ? (actualCost / project.budget) * 100 : 0;

  /* Agrupa el gasto por categoría de material. */
  const categoryMap = new Map<string, { cost: number; items: number }>();

  for (const material of project.materials) {
    const cost = material.quantity * material.unit_price;
    const category = material.category || "Uncategorized";
    const current = categoryMap.get(category) ?? { cost: 0, items: 0 };

    categoryMap.set(category, {
      cost: current.cost + cost,
      items: current.items + 1,
    });
  }

  for (const expense of project.expenses) {
    const current = categoryMap.get(expense.category) ?? {
      cost: 0,
      items: 0,
    };
    categoryMap.set(expense.category, {
      cost: current.cost + expense.amount,
      items: current.items + 1,
    });
  }

  const categoryCosts: CategoryCost[] = [...categoryMap.entries()]
    .map(([category, data]) => ({
      category,
      cost: data.cost,
      items: data.items,
      share: actualCost > 0 ? (data.cost / actualCost) * 100 : 0,
    }))
    .sort((a, b) => b.cost - a.cost);

  /* Material con el costo total más alto. */
  const topMaterial = project.materials.reduce<{
    name: string;
    cost: number;
  } | null>((highest, material) => {
    const cost = material.quantity * material.unit_price;

    if (!highest || cost > highest.cost) {
      return { name: material.material, cost };
    }

    return highest;
  }, null);

  return {
    actualCost,
    profit,
    profitMargin,
    budgetUsed,
    isOverBudget: actualCost > project.budget,
    overrun: Math.max(actualCost - project.budget, 0),
    underrun: Math.max(project.budget - actualCost, 0),
    materialCount: project.materials.length,
    categoryCount: categoryCosts.length,
    categoryCosts,
    topCategory: categoryCosts[0] ?? null,
    topMaterial,
    averageLineCost:
      project.materials.length > 0
        ? actualCost / project.materials.length
        : 0,
  };
}

/*
  ============================================================
  APP PRINCIPAL
  Guarda proyectos, cambia de vista y pinta sidebar + contenido.
  ============================================================
*/

export default function Home() {
  /* Vista actual: "dashboard" | "projects" */
  const [activeView, setActiveView] = useState("dashboard");

  /* Lista de todos los proyectos del usuario. */
  const [projects, setProjects] = useState<Project[]>([]);
  /* Impide sobrescribir localStorage antes de terminar la primera lectura. */
  const hasHydratedProjects = useRef(false);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  /* Proyecto abierto en el dashboard de detalle (null = dashboard general). */
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    null
  );

  /* Campos del formulario "Create New Project". */
  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] = useState("Residential");
  const [projectBudget, setProjectBudget] = useState("");
  const [projectAddress, setProjectAddress] = useState("");
  const [projectClient, setProjectClient] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectStartDate, setProjectStartDate] = useState("");
  const [projectEstimatedEndDate, setProjectEstimatedEndDate] = useState("");

  /*
    Al cargar la página, recupera los proyectos del navegador.
  */
  useEffect(() => {
    /* Solo se ejecuta en cliente: localStorage no existe durante SSR. */
    const savedProjects = localStorage.getItem(
      "project-manager-projects"
    );

    if (!savedProjects) {
      hasHydratedProjects.current = true;
      return;
    }

    try {
      const parsed = JSON.parse(savedProjects);
      if (Array.isArray(parsed)) {
        const normalizedProjects = normalizeImportedProjects(parsed);
        hasHydratedProjects.current = true;
        window.setTimeout(() => setProjects(normalizedProjects), 0);
      } else {
        window.setTimeout(
          () =>
            setStorageMessage(
              "Saved project data has an invalid format, so it was not loaded."
            ),
          0
        );
      }
    } catch {
      window.setTimeout(
        () =>
          setStorageMessage(
            "Saved project data could not be read. Your existing backup was left untouched."
          ),
        0
      );
    }
  }, []);

  /*
    Cada vez que cambia la lista, la vuelve a guardar.
  */
  useEffect(() => {
    /* Persistencia automática; los avisos informan si el navegador la rechaza. */
    if (!hasHydratedProjects.current) {
      return;
    }
    try {
      localStorage.setItem(
        "project-manager-projects",
        JSON.stringify(projects)
      );
      window.setTimeout(() => setStorageMessage(null), 0);
    } catch {
      window.setTimeout(
        () =>
          setStorageMessage(
            "Changes are visible now, but could not be saved in this browser."
          ),
        0
      );
    }
  }, [projects]);

  function exportProjects() {
    /* Genera un JSON versionado y dispara la descarga sin servidor intermedio. */
    setBackupError(null);
    setBackupMessage(null);

    try {
      const backup = {
        format: "project-manager-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        projects,
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `project-manager-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setBackupMessage(
        `Backup exported successfully (${projects.length} ${
          projects.length === 1 ? "project" : "projects"
        }).`
      );
    } catch {
      setBackupError("The project backup could not be exported.");
    }
  }

  async function importProjects(event: React.ChangeEvent<HTMLInputElement>) {
    /* Valida el backup completo antes de pedir confirmación y reemplazar datos. */
    const file = event.target.files?.[0];
    event.target.value = "";
    setBackupError(null);
    setBackupMessage(null);

    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const importedProjects = normalizeImportedProjects(parsed);
      const confirmed = window.confirm(
        `Replace all ${projects.length} current ${
          projects.length === 1 ? "project" : "projects"
        } with ${importedProjects.length} imported ${
          importedProjects.length === 1 ? "project" : "projects"
        }? This cannot be undone.`
      );

      if (!confirmed) return;

      setProjects(importedProjects);
      setSelectedProjectId(null);
      setBackupMessage(
        `Backup imported successfully (${importedProjects.length} ${
          importedProjects.length === 1 ? "project" : "projects"
        }).`
      );
    } catch (error) {
      setBackupError(
        error instanceof SyntaxError
          ? "The selected file is not valid JSON."
          : error instanceof Error
            ? error.message
            : "The project backup could not be imported."
      );
    }
  }

  /* Proyecto seleccionado, o undefined si no hay ninguno abierto. */
  const selectedProject = projects.find(
    (project) => project.id === selectedProjectId
  );
  /* Catálogo base más categorías presentes, compartido por CSV y formulario manual. */
  const materialCategories = Array.from(
    new Set(
      [
        "Concrete",
        "Lumber",
        "Electrical",
        "Drywall",
        ...projects.flatMap((project) =>
          project.materials
            .map((material) => material.category.trim())
            .filter(Boolean)
        ),
      ]
    )
  ).sort();

  /* Crea un proyecto activo y abre su dashboard. */
  function createProject() {
    /* Validación mínima del formulario; los demás campos son opcionales. */
    if (!projectName.trim()) {
      alert("Please enter a project name.");
      return;
    }

    if (!projectBudget || Number(projectBudget) <= 0) {
      alert("Please enter a valid project budget.");
      return;
    }

    const newProject: Project = {
      id: Date.now(),
      name: projectName.trim(),
      type: projectType,
      budget: Number(projectBudget),
      address: projectAddress.trim(),
      client: projectClient.trim(),
      description: projectDescription.trim(),
      startDate: projectStartDate,
      estimatedEndDate: projectEstimatedEndDate,
      actualEndDate: "",
      status: "active",
      materials: [],
      tasks: [],
      expenses: [],
      dailyLogs: [],
    };

    setProjects((currentProjects) => [
      ...currentProjects,
      newProject,
    ]);

    /* Limpia el formulario. */
    setProjectName("");
    setProjectType("Residential");
    setProjectBudget("");
    setProjectAddress("");
    setProjectClient("");
    setProjectDescription("");
    setProjectStartDate("");
    setProjectEstimatedEndDate("");

    /* Abre el proyecto nuevo de inmediato. */
    setSelectedProjectId(newProject.id);
    setActiveView("dashboard");
  }

  /* Añade materiales (CSV o manual) sin borrar los que ya existen. */
  function addProjectMaterials(materials: Material[]) {
    /* La firma evita duplicados incluso si llegan en el mismo lote importado. */
    if (selectedProjectId === null) return;

    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === selectedProjectId
          ? (() => {
              const signatures = new Set(
                project.materials.map(getMaterialSignature)
              );
              const newMaterials = materials.filter((material) => {
                const signature = getMaterialSignature(material);

                if (signatures.has(signature)) return false;

                signatures.add(signature);
                return true;
              });

              return {
                ...project,
                materials: [...project.materials, ...newMaterials],
              };
            })()
          : project
      )
    );
  }

  /* Abre el detalle de un proyecto en el Dashboard. */
  function openProject(projectId: number) {
    /* La selección y la vista se actualizan juntas para abrir el detalle correcto. */
    setSelectedProjectId(projectId);
    setActiveView("dashboard");
  }

  /* Cambia el estado del proyecto y registra la fecha de cierre. */
  function setProjectStatus(status: ProjectStatus) {
    /* Completar conserva una fecha existente o registra la fecha actual. */
    if (selectedProjectId === null) return;

    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === selectedProjectId
          ? {
              ...project,
              status,
              actualEndDate:
                status === "completed"
                  ? project.actualEndDate || new Date().toISOString().slice(0, 10)
                  : "",
            }
          : project
      )
    );
  }

  function updateSelectedProject(updates: Partial<Project>) {
    /* Actualización inmutable de cualquier colección del proyecto seleccionado. */
    if (selectedProjectId === null) return;
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === selectedProjectId ? { ...project, ...updates } : project
      )
    );
  }

  /* Borra un proyecto después de confirmar. */
  function deleteProject(projectId: number) {
    /* La confirmación protege contra borrados accidentales y luego limpia selección. */
    const confirmed = window.confirm(
      "Are you sure you want to delete this project?"
    );

    if (!confirmed) return;

    setProjects((currentProjects) =>
      currentProjects.filter(
        (project) => project.id !== projectId
      )
    );

    setSelectedProjectId(null);
  }

  /*
    ============================================
    USER INTERFACE
    ============================================
  */

  return (
    <main className="min-h-screen bg-[#0f1115] text-white">
      <div className="flex min-h-screen flex-col lg:flex-row">

        {/* ======================================
            SIDEBAR
        ====================================== */}

        <aside className="sticky top-0 z-30 w-full border-b border-[#292e37] bg-[#15181e] p-4 lg:h-screen lg:w-64 lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-5">

          {/* Logo */}

          <div className="mb-5 flex items-center gap-3 lg:mb-10">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#e5a82b] font-bold text-black">
              PM
            </div>

            <div>
              <h1 className="text-sm font-bold tracking-wide">
                PROJECT MANAGER
              </h1>

              <p className="text-xs text-gray-500">
                Construction Management
              </p>
            </div>
          </div>

          {/* Navigation */}

          <nav className="grid grid-cols-2 gap-2 text-sm lg:block lg:space-y-2">

            {/* Dashboard */}

            <button
              onClick={() => {
                setActiveView("dashboard");
                setSelectedProjectId(null);
              }}
              className={`w-full rounded-lg border border-transparent px-3 py-3 text-left transition hover:translate-x-1 hover:border-[#3a414d] ${
                activeView === "dashboard"
                  ? "bg-[#252a32] text-white"
                  : "text-gray-400 hover:bg-[#20242c]"
              }`}
            >
              ▦ Dashboard
            </button>

            {/* Projects */}

            <button
              onClick={() => setActiveView("projects")}
              className={`w-full rounded-lg border border-transparent px-3 py-3 text-left transition hover:translate-x-1 hover:border-[#3a414d] ${
                activeView === "projects"
                  ? "bg-[#252a32] text-white"
                  : "text-gray-400 hover:bg-[#20242c]"
              }`}
            >
              ▣ Projects
            </button>

          </nav>
        </aside>

        {/* ======================================
            MAIN CONTENT
        ====================================== */}

        <section className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        {storageMessage && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200"
          >
            {storageMessage}
          </div>
        )}

          {/* ====================================
              PROJECTS SECTION
          ==================================== */}

          {activeView === "projects" && (
            <ProjectsView
              projects={projects}
              projectName={projectName}
              projectType={projectType}
              projectBudget={projectBudget}
              projectAddress={projectAddress}
              projectClient={projectClient}
              projectDescription={projectDescription}
              projectStartDate={projectStartDate}
              projectEstimatedEndDate={projectEstimatedEndDate}
              setProjectName={setProjectName}
              setProjectType={setProjectType}
              setProjectBudget={setProjectBudget}
              setProjectAddress={setProjectAddress}
              setProjectClient={setProjectClient}
              setProjectDescription={setProjectDescription}
              setProjectStartDate={setProjectStartDate}
              setProjectEstimatedEndDate={setProjectEstimatedEndDate}
              createProject={createProject}
              openProject={openProject}
              deleteProject={deleteProject}
              exportProjects={exportProjects}
              importProjects={importProjects}
              backupMessage={backupMessage}
              backupError={backupError}
            />
          )}

          {/* ====================================
              DASHBOARD
          ==================================== */}

          {activeView === "dashboard" && (
            <>
              {selectedProject ? (
                /* Con proyecto seleccionado se muestra su dashboard completo. */
                <ProjectDashboard
                  project={selectedProject}
                  categories={materialCategories}
                  onBack={() => setSelectedProjectId(null)}
                  onMaterialsLoaded={addProjectMaterials}
                  onStatusChange={setProjectStatus}
                  onUpdateProject={updateSelectedProject}
                  onDelete={() =>
                    deleteProject(selectedProject.id)
                  }
                />
              ) : (
                /* Sin selección se muestra el resumen general de proyectos. */
                <DashboardHome
                  projects={projects}
                  openProject={openProject}
                  createProject={() => setActiveView("projects")}
                />
              )}
            </>
          )}

        </section>
      </div>
    </main>
  );
}

/*
  ============================================================
  DASHBOARD GENERAL
  Proyectos activos en tarjetas + completados en tabla.
  ============================================================
*/

type DashboardHomeProps = {
  /** Proyectos y callbacks que necesita la vista resumen. */
  projects: Project[];
  openProject: (id: number) => void;
  createProject: () => void;
};

function DashboardHome({
  projects,
  openProject,
  createProject,
}: DashboardHomeProps) {
  /* Se separan activos y completados para mostrar operación y cierre por separado. */
  /* Separa activos y completados para mostrarlos distinto. */
  const activeProjects = projects.filter(
    (project) => project.status !== "completed"
  );

  const completedProjects = projects.filter(
    (project) => project.status === "completed"
  );

  return (
    <>
      {/* Header */}

      <header className="mb-8">
        <h2 className="text-2xl font-bold sm:text-3xl">
          Dashboard
        </h2>

        <p className="mt-2 text-sm text-gray-400">
          Active and completed construction projects.
        </p>
      </header>

      {/* Active section title */}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

        <h3 className="text-lg font-semibold">
        Open Projects
        </h3>

        <button
          onClick={createProject}
          className="rounded-lg bg-[#e5a82b] px-4 py-3 text-sm font-semibold text-black transition hover:bg-[#f0b83d]"
        >
          + New Project
        </button>

      </div>

      {activeProjects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#292e37] bg-[#191d24] p-10 text-center">

          <h3 className="text-lg font-semibold">
            No active projects
          </h3>

          <p className="mt-2 text-sm text-gray-500">
            Create a construction project to get started.
          </p>

          <button
            onClick={createProject}
            className="mt-5 rounded-lg bg-[#e5a82b] px-5 py-3 font-semibold text-black"
          >
            Create Project
          </button>

        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {activeProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => openProject(project.id)}
            />
          ))}
        </div>
      )}

      {/* Completed projects */}

      <section className="mt-10">
        <div className="mb-6 flex items-center gap-3">
          <h3 className="text-lg font-semibold">
            Completed Projects
          </h3>

          <span className="rounded-full bg-gray-500/10 px-2.5 py-1 text-xs font-medium text-gray-400">
            {completedProjects.length}
          </span>
        </div>

        {completedProjects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#292e37] p-8 text-center text-sm text-gray-500">
            No completed projects yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#292e37] bg-[#191d24]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-[#292e37] bg-[#16191f] text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-4">Project</th>
                    <th className="px-5 py-4">Type</th>
                    <th className="px-5 py-4">Budget</th>
                    <th className="px-5 py-4">Actual Cost</th>
                    <th className="px-5 py-4">Profit</th>
                    <th className="px-5 py-4">Margin</th>
                    <th className="px-5 py-4">Result</th>
                  </tr>
                </thead>

                <tbody>
                  {completedProjects.map((project) => {
                    const closeout = getProjectCloseout(project);

                    return (
                      <tr
                        key={project.id}
                        onClick={() => openProject(project.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openProject(project.id);
                          }
                        }}
                        tabIndex={0}
                        className="cursor-pointer border-b border-[#292e37] last:border-0 hover:bg-[#1c2027]"
                      >
                        <td className="px-5 py-4 font-medium text-white">
                          {project.name}
                        </td>

                        <td className="px-5 py-4 text-gray-400">
                          {project.type}
                        </td>

                        <td className="px-5 py-4">
                          ${project.budget.toLocaleString()}
                        </td>

                        <td className="px-5 py-4">
                          {formatMoney(closeout.actualCost)}
                        </td>

                        <td
                          className={`px-5 py-4 font-medium ${
                            closeout.profit >= 0
                              ? "text-green-400"
                              : "text-red-400"
                          }`}
                        >
                          {formatMoney(closeout.profit)}
                        </td>

                        <td
                          className={`px-5 py-4 ${
                            closeout.profitMargin >= 0
                              ? "text-green-400"
                              : "text-red-400"
                          }`}
                        >
                          {closeout.profitMargin.toFixed(1)}%
                        </td>

                        <td className="px-5 py-4 text-gray-400">
                          {closeout.isOverBudget
                            ? "Over budget"
                            : "Under budget"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

/*
  ============================================================
  TARJETA DE PROYECTO ACTIVO
  Resumen de presupuesto; al hacer clic abre el detalle.
  ============================================================
*/

type ProjectCardProps = {
  /** Resumen navegable de un proyecto activo. */
  project: Project;
  onClick: () => void;
};

function ProjectCard({
  project,
  onClick,
}: ProjectCardProps) {
  /*
    Tarjeta compacta para proyectos abiertos. Calcula únicamente indicadores
    derivados (inversión, saldo y porcentaje consumido); la edición y la
    persistencia permanecen en Home, que es la fuente única de verdad.
  */
  /* Inversión actual = materiales más gastos registrados. */
  const invested = getProjectCost(project);
  const remaining = project.budget - invested;
  const percentUsed =
    project.budget > 0
      ? (invested / project.budget) * 100
      : 0;

  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl border border-[#292e37] bg-[#191d24] p-5 text-left transition hover:border-[#e5a82b]/60 hover:bg-[#1c2027]"
    >

      {/* Project header */}

      <div className="flex items-start justify-between gap-3">

        <div>
          <h3 className="text-lg font-bold">
            {project.name}
          </h3>

          <p className="mt-1 text-sm text-gray-500">
            {project.type}
          </p>
        </div>

        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            project.status === "completed"
              ? "bg-gray-500/10 text-gray-400"
              : project.status === "paused"
                ? "bg-yellow-500/10 text-yellow-400"
                : "bg-green-500/10 text-green-400"
          }`}
        >
          {project.status === "completed"
            ? "Completed"
            : project.status === "paused"
              ? "Paused"
              : "Active"}
        </span>

      </div>

      {/* Project financial information */}

      <div className="mt-6 space-y-3 text-sm">

        <div className="flex justify-between gap-3">
          <span className="text-gray-500">
            Budget
          </span>

          <span>
            ${project.budget.toLocaleString()}
          </span>
        </div>

        <div className="flex justify-between gap-3">
          <span className="text-gray-500">
            Invested
          </span>

          <span>
            ${invested.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>

        <div className="flex justify-between gap-3">
          <span className="text-gray-500">
            Remaining
          </span>

          <span>
            ${remaining.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>

        <div className="flex justify-between gap-3">
          <span className="text-gray-500">
            Budget Used
          </span>

          <span>
            {percentUsed.toFixed(1)}%
          </span>
        </div>

      </div>

      {/* Progress bar */}

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#292e37]">

        <div
          className="h-full rounded-full bg-[#e5a82b]"
          style={{
            width: `${Math.min(Math.max(percentUsed, 0), 100)}%`,
          }}
        />

      </div>

      <p className="mt-4 text-xs text-gray-500">
        Click to view project details →
      </p>

    </button>
  );
}

/*
  ============================================================
  VISTA PROJECTS
  Crear proyectos y listar activos / completados.
  ============================================================
*/

type ProjectsViewProps = {
  /*
    Props controladas del formulario y acciones de backup. Esta vista no posee
    el estado global: lo recibe de Home y comunica eventos mediante callbacks.
  */
  projects: Project[];
  projectName: string;
  projectType: string;
  projectBudget: string;
  projectAddress: string;
  projectClient: string;
  projectDescription: string;
  projectStartDate: string;
  projectEstimatedEndDate: string;
  setProjectName: (value: string) => void;
  setProjectType: (value: string) => void;
  setProjectBudget: (value: string) => void;
  setProjectAddress: (value: string) => void;
  setProjectClient: (value: string) => void;
  setProjectDescription: (value: string) => void;
  setProjectStartDate: (value: string) => void;
  setProjectEstimatedEndDate: (value: string) => void;
  createProject: () => void;
  openProject: (id: number) => void;
  deleteProject: (id: number) => void;
  exportProjects: () => void;
  importProjects: (event: React.ChangeEvent<HTMLInputElement>) => void;
  backupMessage: string | null;
  backupError: string | null;
};

function ProjectsView({
  projects,
  projectName,
  projectType,
  projectBudget,
  projectAddress,
  projectClient,
  projectDescription,
  projectStartDate,
  projectEstimatedEndDate,
  setProjectName,
  setProjectType,
  setProjectBudget,
  setProjectAddress,
  setProjectClient,
  setProjectDescription,
  setProjectStartDate,
  setProjectEstimatedEndDate,
  createProject,
  openProject,
  deleteProject,
  exportProjects,
  importProjects,
  backupMessage,
  backupError,
}: ProjectsViewProps) {
  /*
    Vista de administración: reúne el formulario controlado de creación, las
    acciones de exportación/importación JSON y los listados navegables. Todos
    los cambios se comunican mediante callbacks para no duplicar estado.
  */
  /* Las dos listas alimentan secciones con acciones y métricas distintas. */
  const activeProjects = projects.filter(
    (project) => project.status !== "completed"
  );

  const completedProjects = projects.filter(
    (project) => project.status === "completed"
  );

  return (
    <>
      <header className="mb-8">
        <h2 className="text-2xl font-bold sm:text-3xl">
          Projects
        </h2>

        <p className="mt-2 text-sm text-gray-400">
          Create and manage all construction projects.
        </p>
      </header>

      <section className="mb-8 rounded-xl border border-[#292e37] bg-[#191d24] p-5 sm:p-6">
        <div>
          <h3 className="text-lg font-semibold">Project Data Backup</h3>
          <p className="mt-1 text-sm text-gray-500">
            Export all projects to JSON or replace your projects from a backup.
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={exportProjects}
            className="rounded-lg border border-[#e5a82b] px-4 py-2 text-sm font-semibold text-[#f0b83d] transition hover:bg-[#e5a82b]/10"
          >
            Export Projects
          </button>
          <label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-[#e5a82b] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#f0b83d]">
            Import Projects
            <input
              type="file"
              accept="application/json,.json"
              onChange={importProjects}
              className="sr-only"
            />
          </label>
        </div>

        {backupMessage && (
          <p className="mt-3 text-sm text-green-400" role="status">
            {backupMessage}
          </p>
        )}
        {backupError && (
          <p className="mt-3 text-sm text-red-300" role="alert">
            {backupError}
          </p>
        )}
      </section>

      {/* CREATE PROJECT */}
      <div className="mb-8 rounded-xl border border-[#292e37] bg-[#191d24] p-5 sm:p-6">
        <h3 className="text-lg font-semibold">
          Create New Project
        </h3>

        <p className="mt-1 text-sm text-gray-500">
          Enter the basic information for your construction project.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <input
            type="text"
            placeholder="Project name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="rounded-lg border border-[#292e37] bg-[#15181e] px-4 py-3 text-white outline-none focus:border-[#e5a82b]"
          />

          <select
            value={projectType}
            onChange={(e) => setProjectType(e.target.value)}
            className="rounded-lg border border-[#292e37] bg-[#15181e] px-4 py-3 text-white outline-none focus:border-[#e5a82b]"
          >
            <option>Residential</option>
            <option>Commercial</option>
            <option>Industrial</option>
            <option>Renovation</option>
            <option>Infrastructure</option>
          </select>

          <input
            type="number"
            placeholder="Project budget"
            value={projectBudget}
            onChange={(e) => setProjectBudget(e.target.value)}
            className="rounded-lg border border-[#292e37] bg-[#15181e] px-4 py-3 text-white outline-none focus:border-[#e5a82b]"
          />

          <input
            type="text"
            placeholder="Address"
            value={projectAddress}
            onChange={(e) => setProjectAddress(e.target.value)}
            className="rounded-lg border border-[#292e37] bg-[#15181e] px-4 py-3 text-white outline-none focus:border-[#e5a82b]"
          />

          <input
            type="text"
            placeholder="Client"
            value={projectClient}
            onChange={(e) => setProjectClient(e.target.value)}
            className="rounded-lg border border-[#292e37] bg-[#15181e] px-4 py-3 text-white outline-none focus:border-[#e5a82b]"
          />

          <input
            type="date"
            aria-label="Start date"
            value={projectStartDate}
            onChange={(e) => setProjectStartDate(e.target.value)}
            className="rounded-lg border border-[#292e37] bg-[#15181e] px-4 py-3 text-white outline-none focus:border-[#e5a82b]"
          />

          <input
            type="date"
            aria-label="Estimated end date"
            value={projectEstimatedEndDate}
            onChange={(e) => setProjectEstimatedEndDate(e.target.value)}
            className="rounded-lg border border-[#292e37] bg-[#15181e] px-4 py-3 text-white outline-none focus:border-[#e5a82b]"
          />

          <textarea
            placeholder="Project description"
            value={projectDescription}
            onChange={(e) => setProjectDescription(e.target.value)}
            className="min-h-12 rounded-lg border border-[#292e37] bg-[#15181e] px-4 py-3 text-white outline-none focus:border-[#e5a82b] md:col-span-3"
          />
        </div>

        <button
          onClick={createProject}
          className="mt-5 w-full rounded-lg bg-[#e5a82b] px-5 py-3 font-semibold text-black transition hover:bg-[#f0b83d] sm:w-auto"
        >
          + Create Project
        </button>
      </div>

      {/* ACTIVE PROJECTS */}
      <section>
        <h3 className="mb-4 text-lg font-semibold">
        Open Projects
        </h3>

        {activeProjects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#292e37] p-8 text-center text-sm text-gray-500">
            No active projects.
          </div>
        ) : (
          <div className="space-y-3">
            {activeProjects.map((project) => (
              <div
                key={project.id}
                className="flex flex-col gap-4 rounded-xl border border-[#292e37] bg-[#191d24] p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold">
                      {project.name}
                    </h4>

                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      project.status === "paused"
                        ? "bg-yellow-500/10 text-yellow-400"
                        : "bg-green-500/10 text-green-400"
                    }`}>
                      {project.status === "paused" ? "Paused" : "Active"}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-gray-500">
                    {project.type} · $
                    {project.budget.toLocaleString()}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openProject(project.id)}
                    className="rounded-lg border border-[#292e37] px-4 py-2 text-sm hover:bg-[#252a32]"
                  >
                    View
                  </button>

                  <button
                    onClick={() => deleteProject(project.id)}
                    className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* COMPLETED PROJECTS */}
      <section className="mt-10">
        <div className="mb-4 flex items-center gap-3">
          <h3 className="text-lg font-semibold">
            Completed Projects
          </h3>

          <span className="rounded-full bg-gray-500/10 px-2.5 py-1 text-xs font-medium text-gray-400">
            {completedProjects.length}
          </span>
        </div>

        {completedProjects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#292e37] p-8 text-center text-sm text-gray-500">
            No completed projects yet.
          </div>
        ) : (
          <div className="space-y-3">
            {completedProjects.map((project) => (
              <div
                key={project.id}
                className="flex flex-col gap-4 rounded-xl border border-[#292e37] bg-[#191d24] p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold">
                      {project.name}
                    </h4>

                    <span className="rounded-full bg-gray-500/10 px-2.5 py-1 text-xs font-medium text-gray-400">
                      Completed
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-gray-500">
                    {project.type} · $
                    {project.budget.toLocaleString()}
                    {" · Profit "}
                    {formatMoney(getProjectCloseout(project).profit)}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openProject(project.id)}
                    className="rounded-lg border border-[#292e37] px-4 py-2 text-sm hover:bg-[#252a32]"
                  >
                    View
                  </button>

                  <button
                    onClick={() => deleteProject(project.id)}
                    className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/*
  ============================================================
  DASHBOARD DE UN PROYECTO
  Alta de materiales, métricas, gráficas y tabla.
  ============================================================
*/

type ProjectDashboardProps = {
  /** Proyecto abierto y operaciones de edición de sus datos anidados. */
  project: Project;
  categories: string[];
  onBack: () => void;
  onMaterialsLoaded: (materials: Material[]) => void;
  onStatusChange: (status: ProjectStatus) => void;
  onUpdateProject: (updates: Partial<Project>) => void;
  onDelete: () => void;
};

function ProjectDashboard({
  project,
  categories,
  onBack,
  onMaterialsLoaded,
  onStatusChange,
  onUpdateProject,
  onDelete,
}: ProjectDashboardProps) {
  /*
    Detalle completo del proyecto seleccionado. La cabecera permite cambiar
    su ciclo de vida y el workspace enlaza con los paneles de agenda, tareas,
    gastos, bitácora, materiales y estadísticas de cierre.
  */
  /* Todas las métricas se derivan durante el render para reflejar cambios al instante. */
  /* Costo invertido y cuánto presupuesto queda. */
  const invested = getProjectCost(project);
  const remaining = project.budget - invested;
  const percentUsed =
    project.budget > 0 ? (invested / project.budget) * 100 : 0;

  /* Estadísticas de cierre (solo se muestran si está completed). */
  const closeout = getProjectCloseout(project);
  const isCompleted = project.status === "completed";
  const taskProgress =
    project.tasks.length > 0
      ? project.tasks.reduce((total, task) => total + task.progress, 0) /
        project.tasks.length
      : 0;
  const today = new Date().toISOString().slice(0, 10);
  const openTaskCount = project.tasks.filter(
    (task) => task.status !== "completed"
  ).length;
  const overdueTaskCount = project.tasks.filter(
    (task) =>
      task.status !== "completed" &&
      Boolean(task.dueDate) &&
      task.dueDate < today
  ).length;
  const openTasks = [...project.tasks]
    .filter((task) => task.status !== "completed")
    .sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  const recentExpense = [...project.expenses].sort((a, b) =>
    b.date.localeCompare(a.date)
  )[0];
  const latestDailyLog = [...project.dailyLogs].sort((a, b) =>
    b.date.localeCompare(a.date)
  )[0];

  return (
    <>
      {/* ======================================
          PROJECT HEADER
      ====================================== */}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

        <div>

          <button
            onClick={onBack}
            className="mb-4 text-sm text-gray-500 hover:text-white"
          >
            ← Back to Dashboard
          </button>

          <div className="flex flex-wrap items-center gap-3">

            <h2 className="text-2xl font-bold sm:text-3xl">
              {project.name}
            </h2>

            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                project.status === "active"
                  ? "bg-green-500/10 text-green-400"
                  : project.status === "paused"
                    ? "bg-yellow-500/10 text-yellow-400"
                    : "bg-gray-500/10 text-gray-400"
              }`}
            >
              {project.status[0].toUpperCase() + project.status.slice(1)}
            </span>

          </div>

          <p className="mt-2 text-sm text-gray-400">
            {project.type} construction project
          </p>

        </div>

        {/* Project actions */}

        <div className="flex flex-wrap gap-2">

          {!isCompleted && (
            <>
              <button
                type="button"
                onClick={() => onStatusChange("completed")}
                className="rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-400 hover:bg-green-500/20"
              >
                Complete
              </button>
              <button
                type="button"
                onClick={() =>
                  onStatusChange(project.status === "paused" ? "active" : "paused")
                }
                className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-sm font-medium text-yellow-300 hover:bg-yellow-500/20"
              >
                {project.status === "paused" ? "Resume" : "Pause"}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20"
          >
            Delete
          </button>

        </div>

        <section className="mb-6 rounded-xl border border-[#292e37] bg-[#191d24] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold">Project Overview</h3>
              <p className="mt-1 text-sm text-gray-400">
                {project.description || "Track schedule, progress, and project costs in one place."}
              </p>
            </div>
            <div className="text-sm text-gray-400 sm:text-right">
              <p>{project.client || "No client specified"}</p>
              <p>{project.address || "No address specified"}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-[#15181e] p-3">
              <p className="text-xs text-gray-500">Start date</p>
              <p className="mt-1 font-medium">{project.startDate || "—"}</p>
            </div>
            <div className="rounded-lg bg-[#15181e] p-3">
              <p className="text-xs text-gray-500">Estimated end</p>
              <p className="mt-1 font-medium">{project.estimatedEndDate || "—"}</p>
            </div>
            <div className="rounded-lg bg-[#15181e] p-3">
              <p className="text-xs text-gray-500">Actual end</p>
              <p className="mt-1 font-medium">{project.actualEndDate || "—"}</p>
            </div>
          </div>
          <div className="mt-5">
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-gray-400">Task progress</span>
              <span>{taskProgress.toFixed(0)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#292e37]">
              <div
                className="h-full rounded-full bg-[#e5a82b]"
                style={{ width: `${taskProgress}%` }}
              />
            </div>
          </div>
        </section>

      </div>

      <section className="mt-8 mb-24 border-b border-[#292e37] pb-12">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Project Workspace</h3>
          <p className="mt-1 text-sm text-gray-500">
            Open the area you need to manage next.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          <a href="#project-tasks" className="group min-h-[300px] rounded-2xl border border-[#4a3b1c] border-t-4 border-t-[#e5a82b] bg-[#20242c] p-7 transition duration-200 hover:-translate-y-2 hover:scale-[1.01] hover:border-[#e5a82b] hover:bg-[#252a32]">
            <div className="flex items-start justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f0b83d]">Workspace</p>
              <span className="text-xl text-[#e5a82b] transition-transform group-hover:translate-x-1">→</span>
            </div>
            <p className="mt-5 text-lg font-semibold">Tasks</p>
            <p className="mt-2 text-4xl font-bold">{project.tasks.length}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-[#15181e] px-2.5 py-1 text-gray-300">
                {openTaskCount} open
              </span>
              {overdueTaskCount > 0 && (
                <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-red-300">
                  {overdueTaskCount} overdue
                </span>
              )}
            </div>
            <div className="mt-5 space-y-2 border-t border-[#3a414d] pt-4">
              {openTasks.length === 0 ? (
                <p className="text-sm text-green-400">All tasks completed</p>
              ) : (
                openTasks.slice(0, 3).map((task) => {
                  const isOverdue =
                    Boolean(task.dueDate) && task.dueDate < today;
                  return (
                    <div key={task.id} className="rounded-lg bg-[#15181e] px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm text-gray-200">
                          {task.title}
                        </span>
                        <span className="shrink-0 text-xs text-gray-500">
                          {task.progress}%
                        </span>
                      </div>
                      <p className={`mt-1 text-xs ${isOverdue ? "text-red-300" : "text-gray-500"}`}>
                        {isOverdue ? "Overdue" : "Due"} {task.dueDate || "not set"} · {task.status.replace("_", " ")}
                      </p>
                    </div>
                  );
                })
              )}
              {openTasks.length > 3 && (
                <p className="text-xs text-gray-500">
                  +{openTasks.length - 3} more open tasks
                </p>
              )}
            </div>
          </a>
          <a href="#project-labor" className="group min-h-[300px] rounded-2xl border border-[#4a3b1c] border-t-4 border-t-[#e5a82b] bg-[#20242c] p-7 transition duration-200 hover:-translate-y-2 hover:scale-[1.01] hover:border-[#e5a82b] hover:bg-[#252a32]">
            <div className="flex items-start justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f0b83d]">Workspace</p>
              <span className="text-xl text-[#e5a82b] transition-transform group-hover:translate-x-1">→</span>
            </div>
            <p className="mt-5 text-lg font-semibold">Labor & Expenses</p>
            <p className="mt-2 text-4xl font-bold">{formatMoney(getExpenseCost(project.expenses))}</p>
            <div className="mt-5 border-t border-[#3a414d] pt-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Latest entry</p>
              <p className="mt-2 truncate text-sm text-gray-200">
                {recentExpense?.description || "No expenses recorded"}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {recentExpense
                  ? `${recentExpense.category} · ${formatMoney(recentExpense.amount)} · ${recentExpense.date || "no date"}`
                  : "Add labor, subcontractor, equipment, or other costs"}
              </p>
            </div>
          </a>
          <a href="#project-daily-logs" className="group min-h-[300px] rounded-2xl border border-[#4a3b1c] border-t-4 border-t-[#e5a82b] bg-[#20242c] p-7 transition duration-200 hover:-translate-y-2 hover:scale-[1.01] hover:border-[#e5a82b] hover:bg-[#252a32]">
            <div className="flex items-start justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f0b83d]">Workspace</p>
              <span className="text-xl text-[#e5a82b] transition-transform group-hover:translate-x-1">→</span>
            </div>
            <p className="mt-5 text-lg font-semibold">Daily Logs</p>
            <p className="mt-2 text-4xl font-bold">{project.dailyLogs.length}</p>
            <div className="mt-5 border-t border-[#3a414d] pt-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Latest log</p>
              <p className="mt-2 truncate text-sm text-gray-200">
                {latestDailyLog?.title || "No daily logs recorded"}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {latestDailyLog
                  ? `${latestDailyLog.date || "No date"} · ${latestDailyLog.workers} workers`
                  : "Add site activity, weather, workers, and notes"}
              </p>
            </div>
          </a>
        </div>
      </section>

      {/* ======================================
          PROJECT SUMMARY
      ====================================== */}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

        <DashboardCard
          title="Project Budget"
          value={`$${project.budget.toLocaleString()}`}
        />

        <DashboardCard
          title={isCompleted ? "Actual Cost" : "Total Cost"}
          value={formatMoney(invested)}
        />

        {isCompleted ? (
          <>
            <DashboardCard
              title="Profit"
              value={formatMoney(closeout.profit)}
              valueClassName={
                closeout.profit >= 0 ? "text-green-400" : "text-red-400"
              }
            />

            <DashboardCard
              title="Profit Margin"
              value={`${closeout.profitMargin.toFixed(2)}%`}
              valueClassName={
                closeout.profitMargin >= 0 ? "text-green-400" : "text-red-400"
              }
            />
          </>
        ) : (
          <>
            <DashboardCard
              title="Remaining Budget"
              value={formatMoney(remaining)}
            />

            <DashboardCard
              title="Budget Used"
              value={`${percentUsed.toFixed(2)}%`}
            />
          </>
        )}

      </div>

      {isCompleted && (
        <CompletedProjectStats
          project={project}
          closeout={closeout}
        />
      )}

      <SchedulePanel project={project} />

      {/* ======================================
          PROJECT CHARTS
      ====================================== */}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">

        <BudgetChart
          budget={project.budget}
          invested={invested}
        />

        <MaterialCostChart
          materials={project.materials}
        />

      </div>

      <div id="project-tasks">
        <TasksPanel project={project} onUpdateProject={onUpdateProject} />
      </div>
      <div id="project-labor">
        <ExpensesPanel project={project} onUpdateProject={onUpdateProject} />
      </div>
      <div id="project-daily-logs">
        <DailyLogsPanel project={project} onUpdateProject={onUpdateProject} />
      </div>

      {!isCompleted && (
        <section id="project-materials" className="mt-8 space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Materials</h3>
            <p className="mt-1 text-sm text-gray-500">
              Import materials or select recommended items for this project type.
            </p>
          </div>
          <CsvUploader
            onMaterialsLoaded={onMaterialsLoaded}
            existingMaterials={project.materials}
          />
          <ManualMaterialForm
            categories={categories}
            existingMaterials={project.materials}
            projectType={project.type}
            onAdd={onMaterialsLoaded}
          />
        </section>
      )}

      {/* ======================================
          MATERIAL TABLE
      ====================================== */}

      <MaterialsTable
        materials={project.materials}
        categories={categories}
        onUpdate={(materials) => onUpdateProject({ materials })}
      />

    </>
  );
}

const expenseCategories: ExpenseCategory[] = [
  "materials",
  "labor",
  "subcontractors",
  "equipment",
  "permits",
  "other",
];

const inputClass =
  "rounded-lg border border-[#292e37] bg-[#15181e] px-3 py-2 text-sm text-white outline-none focus:border-[#e5a82b]";

type ProjectDataPanelProps = {
  /** Contrato común de los paneles de tareas, gastos y bitácora diaria. */
  project: Project;
  onUpdateProject: (updates: Partial<Project>) => void;
};

/*
  Agenda de solo lectura con filtros por estado. Las cantidades de vencidas,
  próximas y completadas se derivan de las tareas actuales y no se persisten.
*/
function SchedulePanel({ project }: { project: Project }) {
  /* Vista de fechas y estado; es deliberadamente de solo lectura. */
  const [filter, setFilter] = useState<"all" | TaskStatus>("all");
  const today = new Date().toISOString().slice(0, 10);
  const overdueCount = project.tasks.filter(
    (task) =>
      task.status !== "completed" &&
      Boolean(task.dueDate) &&
      task.dueDate < today
  ).length;
  const upcomingCount = project.tasks.filter(
    (task) =>
      task.status !== "completed" &&
      (!task.dueDate || task.dueDate >= today)
  ).length;
  const completedCount = project.tasks.filter(
    (task) => task.status === "completed"
  ).length;
  const scheduleTasks = [...project.tasks]
    .filter((task) => filter === "all" || task.status === filter)
    .sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });

  return (
    <section className="mt-14 mb-8 rounded-xl border border-[#292e37] bg-[#191d24] p-5 transition-colors duration-200 hover:border-[#3a414d]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Project Schedule</h3>
          <p className="mt-1 text-sm text-gray-500">
            Review deadlines and work status before opening the full task editor.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-red-500/10 px-3 py-1 text-red-300">
            {overdueCount} overdue
          </span>
          <span className="rounded-full bg-[#252a32] px-3 py-1 text-gray-300">
            {upcomingCount} upcoming
          </span>
          <span className="rounded-full bg-green-500/10 px-3 py-1 text-green-300">
            {completedCount} completed
          </span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {(["all", "pending", "in_progress", "completed"] as const).map(
          (status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(status)}
              className={`rounded-lg border px-3 py-2 text-xs transition-colors duration-200 ${
                filter === status
                  ? "border-[#e5a82b] bg-[#e5a82b] font-semibold text-black"
                  : "border-[#3a414d] text-gray-400 hover:border-[#e5a82b] hover:text-white"
              }`}
            >
              {status === "all"
                ? "All tasks"
                : status === "in_progress"
                  ? "In progress"
                  : status[0].toUpperCase() + status.slice(1)}
            </button>
          )
        )}
      </div>

      <div className="mt-4 space-y-2">
        {scheduleTasks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#292e37] p-4 text-center text-sm text-gray-500">
            No tasks match this filter.
          </p>
        ) : (
          scheduleTasks.map((task) => {
            const isOverdue =
              task.status !== "completed" &&
              Boolean(task.dueDate) &&
              task.dueDate < today;
            return (
              <div
                key={task.id}
                className={`grid gap-3 rounded-lg border bg-[#15181e] p-3 transition-colors duration-200 hover:border-[#4a5563] md:grid-cols-[1.5fr_1fr_0.8fr_0.8fr] md:items-center ${
                  isOverdue ? "border-red-500/50 hover:border-red-400/70" : "border-[#292e37]"
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{task.title}</p>
                  {task.description && (
                    <p className="mt-1 truncate text-xs text-gray-500">
                      {task.description}
                    </p>
                  )}
                </div>
                <p className={`text-xs ${isOverdue ? "text-red-300" : "text-gray-400"}`}>
                  {isOverdue ? "Overdue" : "Due"} {task.dueDate || "not set"}
                </p>
                <p className="text-xs capitalize text-gray-400">
                  {task.status.replace("_", " ")}
                </p>
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#292e37]">
                    <div
                      className="h-full rounded-full bg-[#e5a82b]"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400">{task.progress}%</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function TasksPanel({ project, onUpdateProject }: ProjectDataPanelProps) {
  /*
    Gestiona altas y ediciones de tareas mediante un borrador local. La
    validación limita el progreso a 0–100 y conserva la actualización
    inmutable de la colección del proyecto.
  */
  /* El borrador vive localmente; solo se confirma en onUpdateProject al guardar. */
  const emptyTask = {
    title: "",
    description: "",
    dueDate: "",
    progress: "0",
    status: "pending" as TaskStatus,
  };
  const [draft, setDraft] = useState(emptyTask);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const overdueTasks = project.tasks.filter(
    (task) =>
      task.status !== "completed" &&
      Boolean(task.dueDate) &&
      task.dueDate < today
  );
  const openTasks = project.tasks.filter((task) => task.status !== "completed");
  const orderedTasks = [...project.tasks].sort((a, b) => {
    const aOverdue = overdueTasks.some((task) => task.id === a.id);
    const bOverdue = overdueTasks.some((task) => task.id === b.id);
    if (aOverdue !== bOverdue) return Number(bOverdue) - Number(aOverdue);
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  function saveTask(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    const task: Task = {
      id: editingId ?? Date.now(),
      title: draft.title.trim(),
      description: draft.description.trim(),
      dueDate: draft.dueDate,
      progress: Math.min(100, Math.max(0, Number(draft.progress) || 0)),
      status: draft.status,
    };
    const tasks = editingId
      ? project.tasks.map((item) => (item.id === editingId ? task : item))
      : [...project.tasks, task];
    onUpdateProject({ tasks });
    setDraft(emptyTask);
    setEditingId(null);
    setIsFormOpen(false);
  }

  function editTask(task: Task) {
    setEditingId(task.id);
    setIsFormOpen(true);
    setDraft({
      title: task.title,
      description: task.description,
      dueDate: task.dueDate,
      progress: String(task.progress),
      status: task.status,
    });
  }

  return (
    <section className="mt-8 rounded-xl border border-[#292e37] bg-[#191d24] p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Tasks</h3>
          <p className="mt-1 text-sm text-gray-500">Plan work, deadlines, and completion progress.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
          <span className="rounded-full bg-[#252a32] px-3 py-1 text-gray-400">{openTasks.length} open</span>
          {overdueTasks.length > 0 && <span className="rounded-full bg-red-500/10 px-3 py-1 text-red-300">{overdueTasks.length} overdue</span>}
          <button type="button" onClick={() => { setEditingId(null); setDraft(emptyTask); setIsFormOpen(true); }} className="rounded-lg bg-[#e5a82b] px-3 py-2 font-semibold text-black hover:bg-[#f0b83d]">+ Add task</button>
        </div>
      </div>
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="task-form-title">
          <form onSubmit={saveTask} className="w-full max-w-2xl rounded-2xl border border-[#3a414d] bg-[#191d24] p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h4 id="task-form-title" className="text-lg font-semibold">
                  {editingId ? "Edit Task" : "Add Task"}
                </h4>
                <p className="mt-1 text-sm text-gray-500">
                  Add the work, deadline, status, and current progress.
                </p>
              </div>
              <button type="button" aria-label="Close task form" onClick={() => { setIsFormOpen(false); setEditingId(null); setDraft(emptyTask); }} className="rounded-lg border border-[#292e37] px-3 py-1 text-lg text-gray-400 hover:text-white">×</button>
            </div>
        <input className={inputClass} placeholder="Task title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        <input className={inputClass} type="date" aria-label="Task due date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} />
        <input className={inputClass} placeholder="Description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        <div className="flex gap-3">
          <select className={`${inputClass} min-w-0 flex-1`} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TaskStatus })}>
            <option value="pending">Pending</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
          <input className={`${inputClass} w-28`} type="number" min="0" max="100" placeholder="Progress %" value={draft.progress} onChange={(event) => setDraft({ ...draft, progress: event.target.value })} />
        </div>
        <div className="flex gap-2 md:col-span-2">
          <button type="submit" className="rounded-lg bg-[#e5a82b] px-4 py-2 text-sm font-semibold text-black">
            {editingId ? "Save Task" : "Add Task"}
          </button>
          <button type="button" onClick={() => { setIsFormOpen(false); setEditingId(null); setDraft(emptyTask); }} className="rounded-lg border border-[#292e37] px-4 py-2 text-sm">Cancel</button>
        </div>
          </form>
        </div>
      )}
      <div className="mt-5 space-y-3">
        {project.tasks.length === 0 ? <div className="rounded-lg border border-dashed border-[#292e37] p-5 text-center"><p className="text-sm text-gray-500">No tasks have been added.</p><button type="button" onClick={() => setIsFormOpen(true)} className="mt-3 inline-flex rounded-lg border border-[#e5a82b] px-3 py-2 text-xs font-semibold text-[#f0b83d] hover:bg-[#e5a82b]/10">+ Add your first task</button></div> : orderedTasks.map((task) => {
          const isOverdue =
            task.status !== "completed" &&
            Boolean(task.dueDate) &&
            task.dueDate < today;
          return (
          <div key={task.id} className={`rounded-lg border bg-[#15181e] p-4 ${isOverdue ? "border-red-500/50" : "border-[#292e37]"}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h4 className="font-medium">{task.title}</h4>
                {task.description ? <p className="mt-1 text-sm text-gray-400">{task.description}</p> : null}
                <p className={`mt-2 text-xs ${isOverdue ? "text-red-300" : "text-gray-500"}`}>
                  {isOverdue ? "Overdue · " : "Due "}
                  {task.dueDate || "not set"} · {task.status.replace("_", " ")}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => editTask(task)} className="rounded border border-[#292e37] px-3 py-1 text-xs hover:bg-[#252a32]">Edit</button>
                <button type="button" onClick={() => onUpdateProject({ tasks: project.tasks.filter((item) => item.id !== task.id) })} className="rounded border border-red-500/30 px-3 py-1 text-xs text-red-400 hover:bg-red-500/10">Delete</button>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#292e37]"><div className="h-full rounded-full bg-[#e5a82b]" style={{ width: `${task.progress}%` }} /></div>
              <span className="text-xs text-gray-400">{task.progress}%</span>
            </div>
          </div>
          );
        })}
      </div>
    </section>
  );
}

function ExpensesPanel({ project, onUpdateProject }: ProjectDataPanelProps) {
  /*
    Registra costes no materiales y los agrupa visualmente por categoría. El
    importe se valida antes de enviar la nueva lista al estado de Home.
  */
  /* Registra gastos no materiales y los incorpora al coste total del proyecto. */
  const emptyExpense = {
    description: "",
    category: "materials" as ExpenseCategory,
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  };
  const [draft, setDraft] = useState(emptyExpense);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const expenseTotal = getMaterialCost(project.materials) + getExpenseCost(project.expenses);

  function saveExpense(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(draft.amount);
    if (!draft.description.trim() || !Number.isFinite(amount) || amount < 0) return;
    const expense: Expense = {
      id: editingId ?? Date.now(),
      description: draft.description.trim(),
      category: draft.category,
      amount,
      date: draft.date,
      notes: draft.notes.trim(),
    };
    const expenses = editingId
      ? project.expenses.map((item) => (item.id === editingId ? expense : item))
      : [...project.expenses, expense];
    onUpdateProject({ expenses });
    setDraft(emptyExpense);
    setEditingId(null);
    setIsFormOpen(false);
  }

  function editExpense(expense: Expense) {
    setEditingId(expense.id);
    setIsFormOpen(true);
    setDraft({ description: expense.description, category: expense.category, amount: String(expense.amount), date: expense.date, notes: expense.notes });
  }

  return (
    <section className="mt-8 rounded-xl border border-[#292e37] bg-[#191d24] p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Expenses</h3>
          <p className="mt-1 text-sm text-gray-500">Materials, labor, subcontractors, equipment, permits, and other costs.</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-lg font-semibold text-[#e5a82b]">{formatMoney(expenseTotal)}</p>
          <button type="button" onClick={() => { setEditingId(null); setDraft(emptyExpense); setIsFormOpen(true); }} className="rounded-lg bg-[#e5a82b] px-3 py-2 text-xs font-semibold text-black hover:bg-[#f0b83d]">+ Add expense</button>
        </div>
      </div>
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="expense-form-title">
          <form onSubmit={saveExpense} className="w-full max-w-2xl rounded-2xl border border-[#3a414d] bg-[#191d24] p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h4 id="expense-form-title" className="text-lg font-semibold">
                  {editingId ? "Edit Expense" : "Add Expense"}
                </h4>
                <p className="mt-1 text-sm text-gray-500">Record labor, materials, subcontractors, or another project cost.</p>
              </div>
              <button type="button" aria-label="Close expense form" onClick={() => { setIsFormOpen(false); setEditingId(null); setDraft(emptyExpense); }} className="rounded-lg border border-[#292e37] px-3 py-1 text-lg text-gray-400 hover:text-white">×</button>
            </div>
        <input className={inputClass} placeholder="Expense description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        <div className="flex gap-3">
          <select className={`${inputClass} min-w-0 flex-1`} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as ExpenseCategory })}>
            {expenseCategories.map((category) => <option key={category} value={category}>{category[0].toUpperCase() + category.slice(1)}</option>)}
          </select>
          <input className={`${inputClass} w-32`} type="number" min="0" step="0.01" placeholder="Amount" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} />
        </div>
        <input className={inputClass} type="date" aria-label="Expense date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
        <input className={inputClass} placeholder="Notes (optional)" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        <div className="flex gap-2 md:col-span-2">
          <button type="submit" className="rounded-lg bg-[#e5a82b] px-4 py-2 text-sm font-semibold text-black">{editingId ? "Save Expense" : "Add Expense"}</button>
          <button type="button" onClick={() => { setIsFormOpen(false); setEditingId(null); setDraft(emptyExpense); }} className="rounded-lg border border-[#292e37] px-4 py-2 text-sm">Cancel</button>
        </div>
          </form>
        </div>
      )}
      <div className="mt-5 overflow-x-auto">
        {project.expenses.length === 0 ? <div className="rounded-lg border border-dashed border-[#292e37] p-5 text-center"><p className="text-sm text-gray-500">No labor or additional expenses have been added.</p><button type="button" onClick={() => setIsFormOpen(true)} className="mt-3 inline-flex rounded-lg border border-[#e5a82b] px-3 py-2 text-xs font-semibold text-[#f0b83d] hover:bg-[#e5a82b]/10">+ Add first expense</button></div> : (
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-[#292e37] text-xs uppercase text-gray-500"><tr><th className="px-3 py-3">Description</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Actions</th></tr></thead>
            <tbody>{project.expenses.map((expense) => <tr key={expense.id} className="border-b border-[#292e37] last:border-0"><td className="px-3 py-3">{expense.description}</td><td className="px-3 py-3 text-gray-400">{expense.category}</td><td className="px-3 py-3 text-gray-400">{expense.date || "—"}</td><td className="px-3 py-3 font-semibold text-[#e5a82b]">{formatMoney(expense.amount)}</td><td className="px-3 py-3"><div className="flex gap-2"><button type="button" onClick={() => editExpense(expense)} className="rounded border border-[#292e37] px-2 py-1 text-xs">Edit</button><button type="button" onClick={() => onUpdateProject({ expenses: project.expenses.filter((item) => item.id !== expense.id) })} className="rounded border border-red-500/30 px-2 py-1 text-xs text-red-400">Delete</button></div></td></tr>)}</tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function DailyLogsPanel({ project, onUpdateProject }: ProjectDataPanelProps) {
  /*
    Captura la actividad diaria de obra. El formulario convierte trabajadores
    a número y ordena los registros por fecha para mostrar el más reciente.
  */
  /* Bitácora cronológica del sitio, persistida junto al proyecto padre. */
  const emptyLog = {
    date: new Date().toISOString().slice(0, 10),
    title: "",
    notes: "",
    weather: "",
    workers: "0",
  };
  const [draft, setDraft] = useState(emptyLog);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  function saveLog(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.date) return;
    const log: DailyLog = {
      id: editingId ?? Date.now(),
      date: draft.date,
      title: draft.title.trim(),
      notes: draft.notes.trim(),
      weather: draft.weather.trim(),
      workers: Math.max(0, Number(draft.workers) || 0),
    };
    const dailyLogs = editingId
      ? project.dailyLogs.map((item) => (item.id === editingId ? log : item))
      : [...project.dailyLogs, log];
    onUpdateProject({ dailyLogs });
    setDraft(emptyLog);
    setEditingId(null);
    setIsFormOpen(false);
  }

  function editLog(log: DailyLog) {
    setEditingId(log.id);
    setIsFormOpen(true);
    setDraft({ date: log.date, title: log.title, notes: log.notes, weather: log.weather, workers: String(log.workers) });
  }

  return (
    <section className="mt-8 rounded-xl border border-[#292e37] bg-[#191d24] p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Daily Logs</h3>
          <p className="mt-1 text-sm text-gray-500">Record site activity, conditions, and crew size.</p>
        </div>
        <button type="button" onClick={() => { setEditingId(null); setDraft(emptyLog); setIsFormOpen(true); }} className="rounded-lg bg-[#e5a82b] px-3 py-2 text-xs font-semibold text-black hover:bg-[#f0b83d]">+ Add daily log</button>
      </div>
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="daily-log-form-title">
          <form onSubmit={saveLog} className="w-full max-w-2xl rounded-2xl border border-[#3a414d] bg-[#191d24] p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h4 id="daily-log-form-title" className="text-lg font-semibold">
                  {editingId ? "Edit Daily Log" : "Add Daily Log"}
                </h4>
                <p className="mt-1 text-sm text-gray-500">Capture site activity, conditions, and crew size.</p>
              </div>
              <button type="button" aria-label="Close daily log form" onClick={() => { setIsFormOpen(false); setEditingId(null); setDraft(emptyLog); }} className="rounded-lg border border-[#292e37] px-3 py-1 text-lg text-gray-400 hover:text-white">×</button>
            </div>
        <input className={inputClass} type="date" aria-label="Log date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
        <input className={inputClass} placeholder="Log title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        <input className={inputClass} placeholder="Weather" value={draft.weather} onChange={(event) => setDraft({ ...draft, weather: event.target.value })} />
        <input className={inputClass} type="number" min="0" placeholder="Workers on site" value={draft.workers} onChange={(event) => setDraft({ ...draft, workers: event.target.value })} />
        <textarea className={`${inputClass} min-h-20 md:col-span-2`} placeholder="Notes" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        <div className="flex gap-2 md:col-span-2">
          <button type="submit" className="rounded-lg bg-[#e5a82b] px-4 py-2 text-sm font-semibold text-black">{editingId ? "Save Log" : "Add Log"}</button>
          <button type="button" onClick={() => { setIsFormOpen(false); setEditingId(null); setDraft(emptyLog); }} className="rounded-lg border border-[#292e37] px-4 py-2 text-sm">Cancel</button>
        </div>
          </form>
        </div>
      )}
      <div className="mt-5 space-y-3">
        {project.dailyLogs.length === 0 ? <div className="rounded-lg border border-dashed border-[#292e37] p-5 text-center"><p className="text-sm text-gray-500">No daily activity has been recorded.</p><button type="button" onClick={() => setIsFormOpen(true)} className="mt-3 inline-flex rounded-lg border border-[#e5a82b] px-3 py-2 text-xs font-semibold text-[#f0b83d] hover:bg-[#e5a82b]/10">+ Add first daily log</button></div> : project.dailyLogs.map((log) => <article key={log.id} className="rounded-lg border border-[#292e37] bg-[#15181e] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:justify-between"><div><h4 className="font-medium">{log.title}</h4><p className="mt-1 text-xs text-gray-500">{log.date} · {log.weather || "Weather not recorded"} · {log.workers} workers</p>{log.notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-gray-300">{log.notes}</p> : null}</div><div className="flex gap-2"><button type="button" onClick={() => editLog(log)} className="rounded border border-[#292e37] px-3 py-1 text-xs">Edit</button><button type="button" onClick={() => onUpdateProject({ dailyLogs: project.dailyLogs.filter((item) => item.id !== log.id) })} className="rounded border border-red-500/30 px-3 py-1 text-xs text-red-400">Delete</button></div></div></article>)}
      </div>
    </section>
  );
}

/*
  ============================================================
  TARJETA DE MÉTRICA + BOTÓN "i"
  La "i" muestra un resumen al pasar el mouse.
  ============================================================
*/

type DashboardCardProps = {
  title: string;
  value: string;
  valueClassName?: string;
  info?: string;
};

/* Abre la explicación contextual asociada a una tarjeta de indicador. */
function StatInfoButton({
  label,
  text,
}: {
  /** Texto contextual mostrado en un tooltip accesible al pasar o enfocar. */
  label: string;
  text: string;
}) {
  const iconRef = useRef<HTMLSpanElement>(null);
  /* Retrasa un poco el cierre para poder leer el texto. */
  const hideTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  /* Calcula posición y abre el tooltip encima de todo. */
  function showTooltip() {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }

    const rect = iconRef.current?.getBoundingClientRect();

    if (!rect) return;

    const width = 256;
    const left = Math.min(
      Math.max(8, rect.right - width),
      window.innerWidth - width - 8
    );

    setCoords({
      top: rect.bottom + 8,
      left,
    });
    setOpen(true);
  }

  function hideTooltip() {
    hideTimer.current = window.setTimeout(() => {
      setOpen(false);
    }, 120);
  }

  return (
    <>
      <span
        ref={iconRef}
        aria-label={`About ${label}`}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-[#3a414d] text-[10px] font-bold text-gray-400 transition hover:border-[#e5a82b] hover:text-[#e5a82b]"
      >
        i
      </span>

      {open &&
        createPortal(
          <span
            role="tooltip"
            onMouseEnter={showTooltip}
            onMouseLeave={hideTooltip}
            style={{
              top: coords.top,
              left: coords.left,
            }}
            className="fixed z-[200] w-64 rounded-lg border border-[#292e37] bg-[#15181e] p-3 text-left text-xs font-normal leading-relaxed text-gray-300 shadow-xl"
          >
            {text}
          </span>,
          document.body
        )}
    </>
  );
}

function DashboardCard({
  title,
  value,
  valueClassName = "",
  info,
}: DashboardCardProps) {
  /* KPI reutilizable: muestra título, valor, ayuda y color semántico. */
  /* Tarjeta reutilizable para una cifra y su etiqueta en el resumen financiero. */
  return (
    <div className="relative rounded-xl border border-[#292e37] bg-[#191d24] p-5">

      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-gray-400">
          {title}
        </p>

        {info ? (
          <StatInfoButton
            label={title}
            text={info}
          />
        ) : null}
      </div>

      <p className={`mt-4 break-words text-2xl font-bold ${valueClassName}`}>
        {value}
      </p>

    </div>
  );
}

type CompletedProjectStatsProps = {
  project: Project;
  closeout: ReturnType<typeof getProjectCloseout>;
};

/*
  Estadísticas de close-out: profit, variación y costo por categoría.
*/
function CompletedProjectStats({
  project,
  closeout,
}: CompletedProjectStatsProps) {
  /*
    Desglose posterior al cierre: presenta coste, margen, categorías y el
    material de mayor impacto usando exclusivamente métricas derivadas.
  */
  /* Desglose de cierre: rentabilidad, consumo del presupuesto y categorías. */
  const resultLabel = closeout.isOverBudget
    ? "Cost overrun"
    : closeout.profit === 0
      ? "Break even"
      : "Under budget";

  return (
    <section className="mt-6">
      <header className="mb-4">
        <h3 className="text-lg font-semibold">
          Close-out Statistics
        </h3>

        <p className="mt-1 text-sm text-gray-500">
          Profit and construction cost performance for this completed project.
          Profit is contract budget minus all recorded project costs.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardCard
          title="Budget Variance"
          value={formatMoney(
            closeout.isOverBudget ? -closeout.overrun : closeout.underrun
          )}
          valueClassName={
            closeout.isOverBudget ? "text-red-400" : "text-green-400"
          }
          info="Difference between the contract budget and all recorded project costs. A positive amount means the job finished under budget. A negative amount means it went over budget."
        />

        <DashboardCard
          title="Budget Used"
          value={`${closeout.budgetUsed.toFixed(2)}%`}
          info="Percentage of the project budget that was spent on materials. 100% means the full budget was used. Over 100% means the job exceeded the budget."
        />

        <DashboardCard
          title="Job Result"
          value={resultLabel}
          valueClassName={
            closeout.isOverBudget ? "text-red-400" : "text-green-400"
          }
          info="Final construction close-out outcome. Under budget means there is profit left. Over budget / cost overrun means actual cost was higher than the budget. Break even means cost matched the budget."
        />

        <DashboardCard
          title="Material Line Items"
          value={`${closeout.materialCount}`}
          info="How many material rows were imported for this job. Each row is one material with quantity, unit, and unit price."
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardCard
          title="Cost Categories"
          value={`${closeout.categoryCount}`}
          info="How many distinct material categories were used on this job, such as concrete, lumber, or electrical. More categories usually means a more mixed scope of work."
        />

        <DashboardCard
          title="Largest Cost Category"
          value={closeout.topCategory?.category ?? "—"}
          info="The category that consumed the most money. This is the main cost driver and a good place to review savings or overruns."
        />

        <DashboardCard
          title="Highest Cost Material"
          value={closeout.topMaterial?.name ?? "—"}
          info="The single material line with the highest total cost, calculated as quantity × unit price. It shows which item had the biggest impact on the job."
        />

        <DashboardCard
          title="Avg. Line Item Cost"
          value={formatMoney(closeout.averageLineCost)}
          info="Average cost per material line: total actual cost divided by the number of material rows. Useful to compare how expensive typical items were on this job."
        />
      </div>

      {closeout.topCategory && (
        <p className="mt-4 text-sm text-gray-500">
          {closeout.topCategory.category} is the largest spend at{" "}
          {formatMoney(closeout.topCategory.cost)} (
          {closeout.topCategory.share.toFixed(1)}% of actual cost).
          {closeout.topMaterial
            ? ` Highest material line: ${closeout.topMaterial.name} (${formatMoney(closeout.topMaterial.cost)}).`
            : ""}
          {closeout.isOverBudget
            ? ` This ${project.type.toLowerCase()} job finished ${formatMoney(closeout.overrun)} over budget.`
            : ` This ${project.type.toLowerCase()} job finished ${formatMoney(closeout.underrun)} under budget.`}
        </p>
      )}

      {closeout.categoryCosts.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-xl border border-[#292e37] bg-[#191d24]">
          <div className="border-b border-[#292e37] p-5">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-semibold">
                Cost by Category
              </h4>

              <StatInfoButton
                label="Cost by Category"
                text="Breaks down actual project spend by category. Share of total is each category’s percentage of all recorded costs, so you can see where the money went."
              />
            </div>

            <p className="mt-1 text-sm text-gray-500">
              Material spend grouped by construction category.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-[#292e37] bg-[#16191f] text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-5 py-4">Category</th>
                  <th className="px-5 py-4">Line Items</th>
                  <th className="px-5 py-4">Cost</th>
                  <th className="px-5 py-4">Share of Total</th>
                </tr>
              </thead>

              <tbody>
                {closeout.categoryCosts.map((category) => (
                  <tr
                    key={category.category}
                    className="border-b border-[#292e37] last:border-0"
                  >
                    <td className="px-5 py-4 font-medium text-white">
                      {category.category}
                    </td>

                    <td className="px-5 py-4 text-gray-400">
                      {category.items}
                    </td>

                    <td className="px-5 py-4">
                      {formatMoney(category.cost)}
                    </td>

                    <td className="px-5 py-4 text-gray-400">
                      {category.share.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
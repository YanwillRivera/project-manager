"use client";

/*
  ============================================================
  PROJECT MANAGER — página principal (app/page.tsx)
  ============================================================

  Este archivo contiene toda la aplicación:
  1. Tipos y funciones de cálculo (presupuesto, profit, close-out)
  2. Home: estado, localStorage y acciones de proyectos
  3. Sidebar + vistas: Dashboard, Projects, Cost Calculator
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
import CostCalculator from "../components/CostCalculator";

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
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeProject(value: unknown): Project {
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
  return expenses.reduce((total, expense) => total + expense.amount, 0);
}

function getProjectCost(project: Project) {
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
  /* Vista actual: "dashboard" | "projects" | "calculator" */
  const [activeView, setActiveView] = useState("dashboard");

  /* Lista de todos los proyectos del usuario. */
  const [projects, setProjects] = useState<Project[]>([]);
  const skipFirstSave = useRef(true);

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
    const savedProjects = localStorage.getItem(
      "project-manager-projects"
    );

    if (!savedProjects) {
      return;
    }

    try {
      const parsed = JSON.parse(savedProjects);
      if (Array.isArray(parsed)) {
        window.setTimeout(() => setProjects(parsed.map(normalizeProject)), 0);
      }
    } catch {
      window.setTimeout(() => setProjects([]), 0);
    }
  }, []);

  /*
    Cada vez que cambia la lista, la vuelve a guardar.
  */
  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    localStorage.setItem(
      "project-manager-projects",
      JSON.stringify(projects)
    );
  }, [projects]);

  /* Proyecto seleccionado, o undefined si no hay ninguno abierto. */
  const selectedProject = projects.find(
    (project) => project.id === selectedProjectId
  );
  const materialCategories = Array.from(
    new Set(
      [
        "Concrete",
        "Lumber",
        "Electrical",
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
    setSelectedProjectId(projectId);
    setActiveView("dashboard");
  }

  /* Cambia el estado del proyecto y registra la fecha de cierre. */
  function setProjectStatus(status: ProjectStatus) {
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
    if (selectedProjectId === null) return;
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === selectedProjectId ? { ...project, ...updates } : project
      )
    );
  }

  /* Borra un proyecto después de confirmar. */
  function deleteProject(projectId: number) {
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

        <aside className="w-full border-b border-[#292e37] bg-[#15181e] p-4 lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r lg:p-5">

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

          <nav className="grid grid-cols-3 gap-2 text-sm lg:block lg:space-y-2">

            {/* Dashboard */}

            <button
              onClick={() => {
                setActiveView("dashboard");
                setSelectedProjectId(null);
              }}
              className={`w-full rounded-lg px-3 py-3 text-left transition ${
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
              className={`w-full rounded-lg px-3 py-3 text-left transition ${
                activeView === "projects"
                  ? "bg-[#252a32] text-white"
                  : "text-gray-400 hover:bg-[#20242c]"
              }`}
            >
              ▣ Projects
            </button>

            {/* Cost Calculator */}

            <button
              onClick={() => setActiveView("calculator")}
              className={`w-full rounded-lg px-3 py-3 text-left transition ${
                activeView === "calculator"
                  ? "bg-[#252a32] text-white"
                  : "text-gray-400 hover:bg-[#20242c]"
              }`}
            >
              ∑ Cost Calculator
            </button>

          </nav>
        </aside>

        {/* ======================================
            MAIN CONTENT
        ====================================== */}

        <section className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">

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
            />
          )}

          {/* ====================================
              COST CALCULATOR
          ==================================== */}

          {activeView === "calculator" && (
            <>
              <header className="mb-8">
                <h2 className="text-2xl font-bold sm:text-3xl">
                  Cost Calculator
                </h2>

                <p className="mt-2 text-sm text-gray-400">
                  Estimate material costs for your construction project.
                </p>
              </header>

              <CostCalculator />
            </>
          )}

          {/* ====================================
              DASHBOARD
          ==================================== */}

          {activeView === "dashboard" && (
            <>
              {selectedProject ? (
                /*
                  If a project is selected,
                  show its complete dashboard.
                */
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
                /*
                  Otherwise show the main Dashboard
                  with active and completed projects.
                */
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
  projects: Project[];
  openProject: (id: number) => void;
  createProject: () => void;
};

function DashboardHome({
  projects,
  openProject,
  createProject,
}: DashboardHomeProps) {
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
  project: Project;
  onClick: () => void;
};

function ProjectCard({
  project,
  onClick,
}: ProjectCardProps) {
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
}: ProjectsViewProps) {
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

          <select
            value={project.status}
            onChange={(event) =>
              onStatusChange(event.target.value as ProjectStatus)
            }
            className="rounded-lg border border-[#292e37] bg-[#15181e] px-3 py-2 text-sm text-white outline-none focus:border-[#e5a82b]"
            aria-label="Project status"
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </select>

          <button
            onClick={onDelete}
            className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10"
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

      {/* ======================================
          IMPORT MATERIALS
      ====================================== */}

      {!isCompleted && (
        <div className="mb-6 space-y-4">
          <CsvUploader
            onMaterialsLoaded={onMaterialsLoaded}
            existingMaterials={project.materials}
          />

          <ManualMaterialForm
            categories={categories}
            onAdd={(material) => onMaterialsLoaded([material])}
          />
        </div>
      )}

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

      {/* ======================================
          MATERIAL TABLE
      ====================================== */}

      <MaterialsTable
        materials={project.materials}
        categories={categories}
        onUpdate={(materials) => onUpdateProject({ materials })}
      />

      <TasksPanel project={project} onUpdateProject={onUpdateProject} />
      <ExpensesPanel project={project} onUpdateProject={onUpdateProject} />
      <DailyLogsPanel project={project} onUpdateProject={onUpdateProject} />

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
  project: Project;
  onUpdateProject: (updates: Partial<Project>) => void;
};

function TasksPanel({ project, onUpdateProject }: ProjectDataPanelProps) {
  const emptyTask = {
    title: "",
    description: "",
    dueDate: "",
    progress: "0",
    status: "pending" as TaskStatus,
  };
  const [draft, setDraft] = useState(emptyTask);
  const [editingId, setEditingId] = useState<number | null>(null);

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
  }

  function editTask(task: Task) {
    setEditingId(task.id);
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
        <span className="rounded-full bg-[#252a32] px-3 py-1 text-xs text-gray-400">
          {project.tasks.length}
        </span>
      </div>
      <form onSubmit={saveTask} className="grid gap-3 md:grid-cols-2">
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
          {editingId ? <button type="button" onClick={() => { setEditingId(null); setDraft(emptyTask); }} className="rounded-lg border border-[#292e37] px-4 py-2 text-sm">Cancel</button> : null}
        </div>
      </form>
      <div className="mt-5 space-y-3">
        {project.tasks.length === 0 ? <p className="rounded-lg border border-dashed border-[#292e37] p-5 text-center text-sm text-gray-500">No tasks yet.</p> : project.tasks.map((task) => (
          <div key={task.id} className="rounded-lg border border-[#292e37] bg-[#15181e] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h4 className="font-medium">{task.title}</h4>
                {task.description ? <p className="mt-1 text-sm text-gray-400">{task.description}</p> : null}
                <p className="mt-2 text-xs text-gray-500">Due {task.dueDate || "not set"} · {task.status.replace("_", " ")}</p>
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
        ))}
      </div>
    </section>
  );
}

function ExpensesPanel({ project, onUpdateProject }: ProjectDataPanelProps) {
  const emptyExpense = {
    description: "",
    category: "materials" as ExpenseCategory,
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  };
  const [draft, setDraft] = useState(emptyExpense);
  const [editingId, setEditingId] = useState<number | null>(null);
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
  }

  function editExpense(expense: Expense) {
    setEditingId(expense.id);
    setDraft({ description: expense.description, category: expense.category, amount: String(expense.amount), date: expense.date, notes: expense.notes });
  }

  return (
    <section className="mt-8 rounded-xl border border-[#292e37] bg-[#191d24] p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Expenses</h3>
          <p className="mt-1 text-sm text-gray-500">Materials, labor, subcontractors, equipment, permits, and other costs.</p>
        </div>
        <p className="text-lg font-semibold text-[#e5a82b]">{formatMoney(expenseTotal)}</p>
      </div>
      <form onSubmit={saveExpense} className="grid gap-3 md:grid-cols-2">
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
          {editingId ? <button type="button" onClick={() => { setEditingId(null); setDraft(emptyExpense); }} className="rounded-lg border border-[#292e37] px-4 py-2 text-sm">Cancel</button> : null}
        </div>
      </form>
      <div className="mt-5 overflow-x-auto">
        {project.expenses.length === 0 ? <p className="rounded-lg border border-dashed border-[#292e37] p-5 text-center text-sm text-gray-500">No additional expenses yet. Imported materials are included in the total.</p> : (
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
  const emptyLog = {
    date: new Date().toISOString().slice(0, 10),
    title: "",
    notes: "",
    weather: "",
    workers: "0",
  };
  const [draft, setDraft] = useState(emptyLog);
  const [editingId, setEditingId] = useState<number | null>(null);

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
  }

  function editLog(log: DailyLog) {
    setEditingId(log.id);
    setDraft({ date: log.date, title: log.title, notes: log.notes, weather: log.weather, workers: String(log.workers) });
  }

  return (
    <section className="mt-8 rounded-xl border border-[#292e37] bg-[#191d24] p-5">
      <div className="mb-5">
        <h3 className="text-lg font-semibold">Daily Logs</h3>
        <p className="mt-1 text-sm text-gray-500">Record site activity, conditions, and crew size.</p>
      </div>
      <form onSubmit={saveLog} className="grid gap-3 md:grid-cols-2">
        <input className={inputClass} type="date" aria-label="Log date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
        <input className={inputClass} placeholder="Log title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        <input className={inputClass} placeholder="Weather" value={draft.weather} onChange={(event) => setDraft({ ...draft, weather: event.target.value })} />
        <input className={inputClass} type="number" min="0" placeholder="Workers on site" value={draft.workers} onChange={(event) => setDraft({ ...draft, workers: event.target.value })} />
        <textarea className={`${inputClass} min-h-20 md:col-span-2`} placeholder="Notes" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        <div className="flex gap-2 md:col-span-2">
          <button type="submit" className="rounded-lg bg-[#e5a82b] px-4 py-2 text-sm font-semibold text-black">{editingId ? "Save Log" : "Add Log"}</button>
          {editingId ? <button type="button" onClick={() => { setEditingId(null); setDraft(emptyLog); }} className="rounded-lg border border-[#292e37] px-4 py-2 text-sm">Cancel</button> : null}
        </div>
      </form>
      <div className="mt-5 space-y-3">
        {project.dailyLogs.length === 0 ? <p className="rounded-lg border border-dashed border-[#292e37] p-5 text-center text-sm text-gray-500">No daily logs yet.</p> : project.dailyLogs.map((log) => <article key={log.id} className="rounded-lg border border-[#292e37] bg-[#15181e] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:justify-between"><div><h4 className="font-medium">{log.title}</h4><p className="mt-1 text-xs text-gray-500">{log.date} · {log.weather || "Weather not recorded"} · {log.workers} workers</p>{log.notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-gray-300">{log.notes}</p> : null}</div><div className="flex gap-2"><button type="button" onClick={() => editLog(log)} className="rounded border border-[#292e37] px-3 py-1 text-xs">Edit</button><button type="button" onClick={() => onUpdateProject({ dailyLogs: project.dailyLogs.filter((item) => item.id !== log.id) })} className="rounded border border-red-500/30 px-3 py-1 text-xs text-red-400">Delete</button></div></div></article>)}
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

function StatInfoButton({
  label,
  text,
}: {
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
/**
 * Admin Dashboard - Overview content (prototype, no database).
 */
import { useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Filler,
  DoughnutController,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Line, Doughnut } from "react-chartjs-2";
import { FaGraduationCap } from "react-icons/fa";
import {
  HiOutlineDocumentText,
  HiOutlineUserGroup,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineXCircle,
  HiOutlineCurrencyDollar,
  HiOutlineDotsVertical,
  HiOutlineUserCircle,
} from "react-icons/hi";
import "../css/AdminDashboard.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Filler,
  DoughnutController,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

/* ----- Overview stat cards ----- */
const OVERVIEW_STATS = [
  { label: "Total College Applications", value: "1,284", trend: "↑ 12% from last month", trendUp: true, icon: HiOutlineDocumentText },
  { label: "Active Scholarships", value: "48", trend: "↑ 3 new this month", trendUp: true, icon: HiOutlineUserGroup },
  { label: "Approved", value: "856", trend: "↑ 8% from last month", trendUp: true, icon: HiOutlineCheckCircle },
  { label: "Pending Review", value: "142", trend: "↓ 5% from last month", trendUp: false, icon: HiOutlineClock },
  { label: "Rejected", value: "286", trend: "↓ 3% from last month", trendUp: false, icon: HiOutlineXCircle },
  { label: "Total Funds Distributed", value: "₱2.4M", trend: "↑ 15% from last month", trendUp: true, icon: HiOutlineCurrencyDollar },
];

/* ----- College Applications Overview (area/line chart) ----- */
const APPLICATIONS_TREND = {
  labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  datasets: [
    {
      label: "Approved",
      data: [65, 78, 82, 85, 88, 92, 95, 98, 102, 105, 108, 112],
      borderColor: "#4a5568",
      backgroundColor: "rgba(74, 85, 104, 0.4)",
      fill: true,
      tension: 0.3,
    },
    {
      label: "Total Applications",
      data: [95, 110, 125, 140, 155, 170, 165, 180, 195, 200, 190, 210],
      borderColor: "#ff5722",
      backgroundColor: "rgba(255, 87, 34, 0.35)",
      fill: true,
      tension: 0.3,
    },
  ],
};

/* ----- Scholarship Distribution (pie) ----- */
const SCHOLARSHIP_DISTRIBUTION = {
  labels: ["Engineering", "Business Administration", "Education", "Nursing", "Computer Science"],
  datasets: [
    {
      data: [33, 22, 17, 15, 13],
      backgroundColor: ["#ff5722", "#ff8a65", "#ffab91", "#37474f", "#78909c"],
      borderWidth: 0,
    },
  ],
};

/* ----- Recent Applications table ----- */
const RECENT_APPLICATIONS = [
  { id: "APP-2024-001", name: "Maria Santos", course: "BS Civil Engineering", scholarship: "Engineering Excellence Award", amount: "₱25,000", gpa: "3.9", date: "2/1/2024", status: "pending" },
  { id: "APP-2024-002", name: "Juan Dela Cruz", course: "BS Business Administration", scholarship: "Merit Scholarship", amount: "₱20,000", gpa: "3.8", date: "2/2/2024", status: "approved" },
  { id: "APP-2024-003", name: "Ana Reyes", course: "BS Nursing", scholarship: "Healthcare Grant", amount: "₱30,000", gpa: "3.95", date: "2/3/2024", status: "under review" },
  { id: "APP-2024-004", name: "Carlos Mendoza", course: "BS Computer Science", scholarship: "Tech Excellence Award", amount: "₱28,000", gpa: "3.7", date: "2/4/2024", status: "rejected" },
  { id: "APP-2024-005", name: "Elena Torres", course: "BS Education", scholarship: "Future Educators Grant", amount: "₱22,000", gpa: "3.85", date: "2/5/2024", status: "approved" },
  { id: "APP-2024-006", name: "Miguel Fernandez", course: "BS Civil Engineering", scholarship: "Engineering Excellence Award", amount: "₱25,000", gpa: "3.6", date: "2/6/2024", status: "pending" },
];

const lineChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: "bottom" } },
  scales: { y: { beginAtZero: true } },
};

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: "bottom" } },
};

const statusClass = (status) => {
  const s = (status || "").toLowerCase();
  if (s === "approved") return "status-approved";
  if (s === "rejected") return "status-rejected";
  if (s === "under review") return "status-review";
  return "status-pending";
};

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("Overview");

  return (
    <div className="admin-dashboard">
      {/* Dark header */}
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <div className="dashboard-logo">
            <FaGraduationCap className="dashboard-logo-icon" aria-hidden />
          </div>
          <div>
            <h1 className="dashboard-header-title">College Scholarship Management</h1>
            <p className="dashboard-header-sub">Admin Dashboard</p>
          </div>
        </div>
        <div className="dashboard-header-right">
          <button type="button" className="dashboard-user-btn" aria-label="User menu">
            <HiOutlineUserCircle className="dashboard-user-icon" aria-hidden />
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-content">
          <div className="dashboard-page-title">
            <h2 className="dashboard-page-heading">Dashboard Overview</h2>
            <p className="dashboard-page-sub">Monitor and manage college scholarship applications</p>
          </div>

          {/* Tabs */}
          <nav className="dashboard-tabs" aria-label="Dashboard sections">
            <button
              type="button"
              className={`dashboard-tab ${activeTab === "Overview" ? "dashboard-tab--active" : ""}`}
              onClick={() => setActiveTab("Overview")}
            >
              Overview
            </button>
            <button
              type="button"
              className={`dashboard-tab ${activeTab === "Analytics" ? "dashboard-tab--active" : ""}`}
              onClick={() => setActiveTab("Analytics")}
            >
              Analytics
            </button>
            <button
              type="button"
              className={`dashboard-tab ${activeTab === "Applications" ? "dashboard-tab--active" : ""}`}
              onClick={() => setActiveTab("Applications")}
            >
              Applications
            </button>
          </nav>

          {activeTab === "Overview" && (
            <>
              {/* 6 stat cards */}
              <section className="dashboard-stats-grid">
                {OVERVIEW_STATS.map(({ label, value, trend, trendUp, icon: Icon }) => (
                  <div key={label} className="dashboard-stat-card">
                    <div className="dashboard-stat-card-header">
                      <span className="dashboard-stat-label">{label}</span>
                      <span className="dashboard-stat-icon-wrap">
                        <Icon className="dashboard-stat-icon" aria-hidden />
                      </span>
                    </div>
                    <div className="dashboard-stat-value">{value}</div>
                    <div className={`dashboard-stat-trend ${trendUp ? "dashboard-stat-trend--up" : "dashboard-stat-trend--down"}`}>
                      {trend}
                    </div>
                  </div>
                ))}
              </section>

              {/* Charts row */}
              <section className="dashboard-charts-row">
                <div className="dashboard-panel dashboard-panel--chart">
                  <h3 className="dashboard-panel-title">College Applications Overview</h3>
                  <p className="dashboard-panel-sub">Monthly scholarship applications trend for college students</p>
                  <div className="dashboard-chart-wrap">
                    <Line data={APPLICATIONS_TREND} options={lineChartOptions} />
                  </div>
                </div>
                <div className="dashboard-panel dashboard-panel--chart">
                  <h3 className="dashboard-panel-title">Scholarship Distribution</h3>
                  <p className="dashboard-panel-sub">College applications by course/program</p>
                  <div className="dashboard-chart-wrap dashboard-chart-wrap--pie">
                    <Doughnut data={SCHOLARSHIP_DISTRIBUTION} options={doughnutOptions} />
                  </div>
                </div>
              </section>

              {/* Recent Applications table */}
              <section className="dashboard-panel dashboard-panel--table">
                <h3 className="dashboard-panel-title">Recent College Applications</h3>
                <p className="dashboard-panel-sub">Latest scholarship applications from college students</p>
                <div className="dashboard-table-wrap">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Application ID</th>
                        <th>Student Name</th>
                        <th>Course</th>
                        <th>Scholarship</th>
                        <th>Amount</th>
                        <th>GPA</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {RECENT_APPLICATIONS.map((row) => (
                        <tr key={row.id}>
                          <td><span className="dashboard-table-id">{row.id}</span></td>
                          <td>{row.name}</td>
                          <td>{row.course}</td>
                          <td>{row.scholarship}</td>
                          <td>{row.amount}</td>
                          <td>{row.gpa}</td>
                          <td>{row.date}</td>
                          <td><span className={`dashboard-status-pill ${statusClass(row.status)}`}>{row.status}</span></td>
                          <td>
                            <button type="button" className="dashboard-actions-btn" aria-label="Actions">
                              <HiOutlineDotsVertical aria-hidden />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {activeTab === "Analytics" && (
            <div className="dashboard-panel">
              <p className="dashboard-placeholder">Analytics view — coming soon.</p>
            </div>
          )}

          {activeTab === "Applications" && (
            <div className="dashboard-panel">
              <p className="dashboard-placeholder">Applications view — coming soon.</p>
            </div>
          )}

          <p className="dashboard-note">Prototype — no database connected. Sample data only.</p>
        </div>
      </main>
    </div>
  );
}

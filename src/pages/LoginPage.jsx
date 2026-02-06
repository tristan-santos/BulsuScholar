import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaGraduationCap } from "react-icons/fa";
import { HiOutlineMail, HiOutlineLockClosed } from "react-icons/hi";
import "../css/LoginPage.css";
import loginBackground from "../assets/LoginBackground.jpg";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    // Prototype: no database — accept any credentials and redirect
    navigate("/admin-dashboard", { replace: true });
  };

  return (
    <div className="login-page">
      <div
        className="login-panel login-panel-info"
        style={{ "--login-bg": `url(${loginBackground})` }}
      >
        <div className="login-info-inner">
          <div className="login-info-icon" aria-hidden>
            <FaGraduationCap className="login-graduation-icon" />
          </div>
          <h1 className="login-info-title">
            College Scholarship Tracking & Management System
          </h1>
          <p className="login-info-desc">
            Empowering college students to achieve their educational dreams through
            streamlined scholarship management.
          </p>
          <ul className="login-info-features" role="list">
            <li>
              <span className="login-feature-title">Comprehensive Tracking</span>
              <span className="login-feature-desc">
                Monitor all college scholarship applications in one place
              </span>
            </li>
            <li>
              <span className="login-feature-title">Real-time Analytics</span>
              <span className="login-feature-desc">
                Get insights with powerful dashboards and reports
              </span>
            </li>
            <li>
              <span className="login-feature-title">Efficient Management</span>
              <span className="login-feature-desc">
                Streamline the review and approval process
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="login-panel login-panel-form">
        <div className="login-form-inner">
          <h2 className="login-form-title">Admin Login</h2>
          <p className="login-form-subtitle">Sign in to access your dashboard</p>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <label className="login-label" htmlFor="login-email">
              Email Address
            </label>
            <div className="login-input-wrap">
              <HiOutlineMail className="login-input-icon" aria-hidden />
              <input
                id="login-email"
                type="email"
                className="login-input"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoCapitalize="off"
              />
            </div>

            <label className="login-label" htmlFor="login-password">
              Password
            </label>
            <div className="login-input-wrap">
              <HiOutlineLockClosed className="login-input-icon" aria-hidden />
              <input
                id="login-password"
                type="password"
                className="login-input"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <a href="#forgot" className="login-forgot">Forgot password?</a>

            <button type="submit" className="login-submit">
              Sign In
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

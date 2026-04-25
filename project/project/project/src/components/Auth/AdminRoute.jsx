import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

export function AdminRoute({ children }) {
  const { user } = useAuth();

  if (!user || !(user.isAdmin || user.role === 'super_admin')) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
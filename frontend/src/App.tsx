import { BrowserRouter as Router, Routes, Route, Link, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/components/theme-provider";
import Dashboard from "@/pages/Dashboard";
import Admin from "@/pages/Admin";
import Editor from "@/pages/Editor";
import Login from "@/pages/Login";
import { NotificationCenter } from "@/components/NotificationCenter";
import { ModeToggle } from "@/components/mode-toggle";
import { Toaster } from "@/components/ui/sonner"; // Import Toaster
import { Network } from "lucide-react";
import { JSX } from "react";

function ProtectedRoute({ children }: { children: JSX.Element }) {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div className="h-screen flex items-center justify-center bg-background text-foreground">Initializing...</div>;
    if (!user) return <Navigate to="/login" />;
    return children;
}

function NavBar() {
    const { user, logout } = useAuth();
    if (!user) return null;

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-16 items-center justify-between px-6 max-w-7xl mx-auto">
                <div className="flex items-center gap-8">
                    <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-primary">
                        <Network className="h-6 w-6" />
                        <span>GFS Based Collaborative Docs</span>
                    </div>
                    <nav className="flex items-center gap-6 text-sm font-medium">
                        <Link to="/dashboard" className="transition-colors hover:text-primary text-muted-foreground hover:bg-accent px-3 py-2 rounded-md">Dashboard</Link>
                        <Link to="/admin" className="transition-colors hover:text-primary text-muted-foreground hover:bg-accent px-3 py-2 rounded-md">Admin Console</Link>
                    </nav>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 mr-2">
                        <span className="text-sm text-muted-foreground hidden md:inline-block">Signed in as</span>
                        <span className="text-sm font-semibold">{user.username}</span>
                    </div>
                    <NotificationCenter />
                    <ModeToggle />
                    <button onClick={logout} className="text-sm font-medium text-destructive hover:bg-destructive/10 px-3 py-2 rounded-md transition-colors">
                        Logout
                    </button>
                </div>
            </div>
        </header>
    );
}

export default function App() {
    return (
        <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
            <AuthProvider>
                <Router>
                    <NavBar />
                    <main className="min-h-[calc(100vh-4rem)] bg-muted/30 dark:bg-background">
                        <Routes>
                            <Route path="/login" element={<Login />} />
                            <Route path="/" element={<Navigate to="/dashboard" />} />
                            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                            <Route path="/doc/:id" element={<ProtectedRoute><Editor /></ProtectedRoute>} />
                            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
                        </Routes>
                    </main>
                    <Toaster /> {/* Added Toaster here */}
                </Router>
            </AuthProvider>
        </ThemeProvider>
    );
}
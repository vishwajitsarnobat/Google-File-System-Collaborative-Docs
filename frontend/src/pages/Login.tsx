import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Network, ShieldCheck, Loader2 } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { toast } from "sonner";

export default function Login() {
    const [isRegister, setIsRegister] = useState(false);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        
        try {
            let data;
            if (isRegister) {
                data = await api.register({ username, password });
                toast.success("Account created successfully!");
            } else {
                data = await api.login({ username, password });
            }
            
            login(data);
            navigate("/dashboard");
        } catch (err: any) {
            setError(err.response?.data?.error || "Authentication failed. Is the cluster running?");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen w-full bg-muted/40 dark:bg-background">
            {/* Left Panel: Branding */}
            <div className="hidden lg:flex w-1/2 bg-primary items-center justify-center p-12 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary to-violet-700 opacity-90" />
                <div className="relative z-10 text-white max-w-lg space-y-6">
                    <div className="flex items-center gap-3 text-3xl font-bold">
                        <Network className="h-10 w-10" />
                        <h1>GFS Distributed</h1>
                    </div>
                    <p className="text-lg text-primary-foreground/90 leading-relaxed">
                        Simulate Bully Election, Berkeley Clock Synchronization, and Fault-Tolerant 
                        data replication in a modern web environment.
                    </p>
                    <div className="flex gap-4 pt-4">
                        <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full backdrop-blur-sm border border-white/20">
                            <ShieldCheck className="h-5 w-5" /> Secure
                        </div>
                        <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full backdrop-blur-sm border border-white/20">
                            <Network className="h-5 w-5" /> Distributed
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Panel: Form */}
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="absolute top-8 right-8">
                    <ModeToggle />
                </div>
                <Card className="w-full max-w-md border-none shadow-2xl dark:shadow-none dark:bg-card dark:border">
                    <CardHeader className="space-y-1">
                        <CardTitle className="text-2xl font-bold tracking-tight">
                            {isRegister ? "Create an account" : "Sign in to your account"}
                        </CardTitle>
                        <CardDescription>
                            {isRegister ? "Enter your details below to create your account" : "Enter your username below to login to your account"}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <Alert variant="destructive" className="animate-in fade-in-50">
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}
                            <div className="space-y-2">
                                <Label htmlFor="username">Username</Label>
                                <Input 
                                    id="username" 
                                    placeholder="distributed_user" 
                                    value={username} 
                                    onChange={e => setUsername(e.target.value)} 
                                    required 
                                    className="h-11"
                                    disabled={loading}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">Password</Label>
                                <Input 
                                    id="password" 
                                    type="password" 
                                    value={password} 
                                    onChange={e => setPassword(e.target.value)} 
                                    required 
                                    className="h-11"
                                    disabled={loading}
                                />
                            </div>
                            <Button type="submit" className="w-full h-11 text-base mt-2 shadow-lg shadow-primary/25" disabled={loading}>
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isRegister ? "Create Account" : "Sign In")}
                            </Button>
                            <div className="text-center text-sm mt-4">
                                <span className="text-muted-foreground">
                                    {isRegister ? "Already have an account? " : "Don't have an account? "}
                                </span>
                                <button type="button" onClick={() => { setIsRegister(!isRegister); setError(""); }} className="text-primary hover:underline font-medium">
                                    {isRegister ? "Sign In" : "Sign Up"}
                                </button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
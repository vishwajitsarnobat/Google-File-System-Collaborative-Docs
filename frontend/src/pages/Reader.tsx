import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, AlertTriangle, Lock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Reader() {
    const { id } = useParams();
    const { user } = useAuth();
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isDenied, setIsDenied] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            if (!user || !id) return;
            
            try {
                setLoading(true);
                setError(null);
                setIsDenied(false);
                
                const data = await api.readFile(id, user.user_id);
                setContent(data.content);
            } catch (err: any) {
                if (err.response?.status === 403) {
                    setIsDenied(true);
                    setError("You do not have permission to view this file.");
                } else if (err.response?.status === 503) {
                    setError("System unavailable. Replicas might be down.");
                } else {
                    setError("Could not retrieve file.");
                }
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id, user]);

    if (loading) {
        return (
            <div className="flex h-screen justify-center items-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (isDenied) {
        return (
            <div className="p-8 max-w-3xl mx-auto flex flex-col items-center justify-center h-[60vh]">
                <div className="bg-red-100 p-4 rounded-full mb-4">
                    <Lock className="h-8 w-8 text-red-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">Access Denied</h2>
                <p className="text-slate-500 mb-6">You don't have permission to view this document.</p>
                <Link to="/dashboard">
                    <Button variant="outline">Back to Dashboard</Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-3xl mx-auto space-y-6">
            <Link to="/dashboard">
                <Button variant="ghost" size="sm" className="mb-4">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
                </Button>
            </Link>

            <Card className="shadow-sm">
                <CardHeader className="border-b bg-slate-50/50">
                    <CardTitle className="flex justify-between items-center">
                        <span>Document Viewer</span>
                        <span className="text-sm font-mono font-normal text-muted-foreground bg-slate-100 px-2 py-1 rounded">
                            {id}
                        </span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {error ? (
                        <div className="p-6">
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Error</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        </div>
                    ) : (
                        <div className="prose max-w-none p-8 font-mono text-sm whitespace-pre-wrap min-h-[300px]">
                            {content}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
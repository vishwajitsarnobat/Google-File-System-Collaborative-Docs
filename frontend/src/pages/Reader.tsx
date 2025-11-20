import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Reader() {
    const { id } = useParams();
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                // The ID here should match what you passed from Dashboard
                // If using filename as ID for the simplified middleware, ensure it matches
                const data = await api.readFile(id || "");
                setContent(data.content);
            } catch (err) {
                setError("Could not retrieve file. All replicas might be down.");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id]);

    return (
        <div className="p-8 max-w-3xl mx-auto space-y-6">
            <Link to="/dashboard">
                <Button variant="ghost" size="sm" className="mb-4">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
                </Button>
            </Link>

            <Card>
                <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                        <span>Document Viewer</span>
                        <span className="text-sm font-normal text-muted-foreground">ID: {id}</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : error ? (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    ) : (
                        <div className="prose max-w-none p-6 bg-slate-50 rounded-lg border min-h-[200px]">
                            {content}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
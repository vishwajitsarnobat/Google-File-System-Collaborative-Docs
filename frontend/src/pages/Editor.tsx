import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
    Loader2, 
    Lock, 
    ArrowLeft, 
    Save, 
    Edit3, 
    RefreshCw, 
    AlertTriangle,
    CheckCircle2
} from "lucide-react";

export default function Editor() {
    const { id } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    
    // State
    const [content, setContent] = useState<string>("");
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [requestSent, setRequestSent] = useState(false);
    
    // Ref to track editing state inside intervals without dependencies
    const isEditingRef = useRef(false);

    // --- Data Fetching ---

    const fetchContent = async () => {
        // Prevent overwriting user input if they are actively typing
        if (isEditingRef.current) return;
        
        try {
            const res = await axios.post(`http://localhost:3000/api/docs/read/${id}`, {
                user_id: user?.user_id
            });
            setContent(res.data.content);
            setError(null);
            setPermissionDenied(false);
        } catch (err: any) {
            if (err.response && err.response.status === 403) {
                setPermissionDenied(true);
            } else if (err.response && err.response.status === 503) {
                // Cluster rebalancing or dead nodes
                if (!content) setError("System unavailable. Retrying connection...");
            } else {
                if (!content) setError("Document unavailable.");
            }
        } finally {
            setLoading(false);
        }
    };

    // Initial Load
    useEffect(() => {
        if (user) fetchContent();
    }, [id, user]);

    // Polling Interval
    useEffect(() => {
        const interval = setInterval(fetchContent, 3000); 
        return () => clearInterval(interval);
    }, [id, user]);

    // --- Handlers ---

    const handleSave = async () => {
        if (!content) return;
        setSaving(true);
        try {
            await axios.post("http://localhost:3000/api/docs/update", {
                file_id: id,
                content: content,
                user_id: user?.user_id
            });
            
            toast.success("Changes saved to cluster.");
            setIsEditing(false);
            isEditingRef.current = false;
            fetchContent(); 
        } catch (e: any) {
            if (e.response?.status === 503) {
                toast.error("Save Failed: No active Chunkservers.");
            } else {
                toast.error("Save Failed: Cluster might be in election.");
            }
        } finally {
            setSaving(false);
        }
    };

    const handleRequestAccess = async (type: 'READ' | 'EDIT') => {
        try {
            await axios.post("http://localhost:3000/api/access/request", {
                file_id: id,
                user_id: user?.user_id,
                access_type: type
            });
            setRequestSent(true);
            toast.success("Access request sent to owner.");
        } catch (e) {
            toast.info("Request already pending.");
        }
    };

    const toggleEdit = () => {
        setIsEditing(true);
        isEditingRef.current = true;
    };

    const cancelEdit = () => {
        setIsEditing(false);
        isEditingRef.current = false;
        fetchContent(); 
    };

    // --- Renders ---

    if (loading) {
        return (
            <div className="flex h-screen w-full justify-center items-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    // 1. Access Denied View
    if (permissionDenied) {
        return (
            <div className="flex h-screen w-full justify-center items-center bg-slate-50 p-4 dark:bg-background">
                <Card className="w-full max-w-md shadow-lg border-red-100 dark:border-red-900">
                    <CardHeader className="text-center pb-2">
                        <div className="mx-auto bg-red-100 dark:bg-red-900/30 p-4 rounded-full w-fit mb-4">
                            <Lock className="h-8 w-8 text-red-600 dark:text-red-400" />
                        </div>
                        <CardTitle className="text-xl">Access Restricted</CardTitle>
                        <p className="text-sm text-muted-foreground mt-2">
                            You do not have permission to view this document.
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-4">
                        {requestSent ? (
                            <div className="flex flex-col items-center justify-center p-4 bg-green-50 text-green-700 border border-green-200 rounded-md dark:bg-green-900/20 dark:text-green-400 dark:border-green-900">
                                <CheckCircle2 className="h-6 w-6 mb-2" />
                                <span className="font-medium">Request Sent!</span>
                                <span className="text-xs">Wait for the owner to approve.</span>
                            </div>
                        ) : (
                            <Button 
                                className="w-full bg-blue-600 hover:bg-blue-700" 
                                onClick={() => handleRequestAccess('READ')}
                            >
                                Request Access
                            </Button>
                        )}
                        
                        <Button variant="outline" className="w-full" onClick={() => navigate('/dashboard')}>
                            Return to Dashboard
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // 2. Main Editor View
    return (
        <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
            
            {/* Header Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="-ml-2">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
                </Button>

                <div className="flex items-center gap-2">
                    {isEditing ? (
                        <>
                            <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                                Cancel
                            </Button>
                            <Button onClick={handleSave} disabled={saving} className="min-w-[100px]">
                                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                                Save
                            </Button>
                        </>
                    ) : (
                        <Button onClick={toggleEdit} variant="default">
                            <Edit3 className="mr-2 h-4 w-4" /> Edit Document
                        </Button>
                    )}
                </div>
            </div>
            
            {/* System Errors */}
            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Cluster Stability Issue</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            
            {/* Main Content Card */}
            <Card className="min-h-[600px] flex flex-col shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between border-b bg-slate-50/50 px-6 py-4 dark:bg-muted/20">
                    <div>
                        <CardTitle className="text-lg">Document Viewer</CardTitle>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                             <span className="font-mono">ID: {id}</span>
                             {/* Sync Indicator */}
                             {!isEditing && !error && (
                                 <Badge variant="outline" className="h-5 gap-1 bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                                     <RefreshCw className="h-3 w-3 animate-spin-slow"/> Live Sync
                                 </Badge>
                             )}
                        </div>
                    </div>
                    {isEditing ? (
                        <Badge className="bg-blue-600 hover:bg-blue-700">EDITING MODE</Badge>
                    ) : (
                        <Badge variant="secondary">READ ONLY</Badge>
                    )}
                </CardHeader>
                
                <CardContent className="flex-1 p-0">
                    {isEditing ? (
                        <Textarea 
                            value={content} 
                            onChange={(e) => setContent(e.target.value)} 
                            className="w-full h-full min-h-[550px] resize-none border-0 rounded-none focus-visible:ring-0 p-6 font-mono text-sm leading-relaxed bg-background"
                            placeholder="Start typing..."
                            autoFocus
                        />
                    ) : (
                        <div className="w-full h-full min-h-[550px] p-6 font-mono text-sm leading-relaxed whitespace-pre-wrap">
                            {content || <span className="text-muted-foreground italic">Empty document...</span>}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
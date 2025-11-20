import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, Loader2, RefreshCw, Copy, FolderOpen } from "lucide-react";
import { toast } from "sonner";

// Interface for File Data
interface Doc {
    id: string;
    name: string;
    owner: string;
    access: 'OWNER' | 'SHARED';
}

export default function Dashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    
    // State
    const [files, setFiles] = useState<Doc[]>([]);
    const [loadingFiles, setLoadingFiles] = useState(false);
    const [creating, setCreating] = useState(false);
    
    // Form Inputs
    const [newFilename, setNewFilename] = useState("");
    const [newContent, setNewContent] = useState("");
    const [sharedId, setSharedId] = useState("");

    // --- Actions ---

    const fetchFiles = async () => {
        if (!user) return;
        setLoadingFiles(true);
        try {
            const res = await axios.get(`http://localhost:3000/api/docs/list/${user.user_id}`);
            setFiles(res.data.files);
        } catch (e) {
            console.error("Failed to fetch files");
            toast.error("Could not fetch files. The cluster might be down.");
        } finally {
            setLoadingFiles(false);
        }
    };

    useEffect(() => {
        fetchFiles();
    }, [user]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!newFilename || !newContent) return;

        setCreating(true);
        try {
            const res = await axios.post("http://localhost:3000/api/docs/create", {
                filename: newFilename,
                content: newContent,
                user_id: user?.user_id
            });
            
            toast.success("File created successfully!");
            
            // Reset form
            setNewFilename("");
            setNewContent("");
            
            // Navigate to the new document
            navigate(`/doc/${res.data.file_id}`);
        } catch (error: any) {
            if (error.response?.status === 503) {
                toast.error("System Busy: No Chunkservers available.", {
                    description: "The storage nodes are offline or initializing. Check Admin Console."
                });
            } else if (error.response?.status === 500) {
                toast.error("Transaction Failed", {
                    description: "Write failed. A Master re-election might be in progress."
                });
            } else {
                toast.error("An unexpected error occurred.");
            }
        } finally {
            setCreating(false);
        }
    };

    const handleOpenShared = () => {
        if (!sharedId.trim()) return;
        navigate(`/doc/${sharedId.trim()}`);
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("File ID copied to clipboard"); 
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Dashboard</h2>
                    <p className="text-muted-foreground">Manage your distributed documents.</p>
                </div>
                <Button variant="outline" onClick={fetchFiles} disabled={loadingFiles}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${loadingFiles ? 'animate-spin' : ''}`} />
                    Refresh List
                </Button>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
                
                {/* LEFT COLUMN: Actions */}
                <div className="space-y-6 md:col-span-1">
                    
                    {/* Create New File */}
                    <Card>
                        <CardHeader>
                            <CardTitle>New Document</CardTitle>
                            <CardDescription>Create a file replicated across the cluster.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleCreate} className="space-y-4">
                                <div className="space-y-2">
                                    <Input 
                                        placeholder="Filename (e.g., notes.txt)" 
                                        value={newFilename} 
                                        onChange={e => setNewFilename(e.target.value)} 
                                        required 
                                    />
                                    <Input 
                                        placeholder="Initial Content..." 
                                        value={newContent} 
                                        onChange={e => setNewContent(e.target.value)} 
                                        required 
                                    />
                                </div>
                                <Button type="submit" className="w-full" disabled={creating}>
                                    {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                                    Create File
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    {/* Open Shared File */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Open Shared File</CardTitle>
                            <CardDescription>Access a document owned by someone else.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex w-full items-center space-x-2">
                                <Input 
                                    placeholder="Paste File ID..." 
                                    value={sharedId}
                                    onChange={e => setSharedId(e.target.value)}
                                />
                                <Button type="button" onClick={handleOpenShared}>
                                    <FolderOpen className="h-4 w-4" />
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground mt-3">
                                * Entering an ID you don't have access to will trigger the Request Access flow.
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* RIGHT COLUMN: File List */}
                <Card className="md:col-span-2 h-fit min-h-[500px]">
                    <CardHeader>
                        <CardTitle>Your Documents</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[300px]">Name</TableHead>
                                    <TableHead>File ID (For Sharing)</TableHead>
                                    <TableHead>Owner</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {files.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-muted-foreground py-12">
                                            {loadingFiles ? "Loading files..." : "No files found. Create one to get started."}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    files.map((file) => (
                                        <TableRow key={file.id}>
                                            <TableCell className="font-medium flex items-center gap-2">
                                                <div className="bg-blue-100 p-2 rounded text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                                                    <FileText className="h-4 w-4" />
                                                </div>
                                                {file.name}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2 group">
                                                    <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-xs text-slate-500 dark:text-slate-400">
                                                        {file.id.substring(0, 8)}...
                                                    </code>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={() => copyToClipboard(file.id)}
                                                        title="Copy Full ID"
                                                    >
                                                        <Copy className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={file.access === 'OWNER' ? "default" : "secondary"}>
                                                    {file.access === 'OWNER' ? 'Me' : file.owner}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button size="sm" variant="ghost" onClick={() => navigate(`/doc/${file.id}`)}>
                                                    Open
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
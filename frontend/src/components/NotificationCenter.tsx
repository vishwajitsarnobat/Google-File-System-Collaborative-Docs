import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { Bell, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";

const API_URL = "http://localhost:3000/api";

interface AccessRequest {
    req_id: string;
    filename: string;
    requestor_name: string;
    type: string;
}

export function NotificationCenter() {
    const { user } = useAuth();
    const [requests, setRequests] = useState<AccessRequest[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchRequests = async () => {
        if (!user) return;
        try {
            const res = await axios.get(`${API_URL}/access/notifications/${user.user_id}`);
            setRequests(res.data);
        } catch (e) { 
            // Silent fail on poll
            console.error("Notification poll failed"); 
        }
    };

    useEffect(() => {
        fetchRequests();
        const interval = setInterval(fetchRequests, 5000);
        return () => clearInterval(interval);
    }, [user]);

    const handleAction = async (req_id: string, action: 'APPROVED' | 'REJECTED') => {
        setLoading(true);
        try {
            await axios.post(`${API_URL}/access/approve`, { req_id, action });
            setRequests(prev => prev.filter(r => r.req_id !== req_id));
            toast.success(`Request ${action.toLowerCase()} successfully.`);
        } catch (e) { 
            toast.error("Failed to process request.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="relative">
                    <Bell className="h-4 w-4" />
                    {requests.length > 0 && (
                        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
                <div className="grid gap-4">
                    <div className="space-y-2 border-b pb-2">
                        <h4 className="font-medium leading-none">Access Requests</h4>
                        <p className="text-xs text-muted-foreground">
                            {requests.length === 0 ? "No pending requests." : "Users requesting access to your files."}
                        </p>
                    </div>
                    <div className="grid gap-2 max-h-[300px] overflow-y-auto">
                        {requests.map((req) => (
                            <div key={req.req_id} className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                                <div className="text-sm">
                                    <p className="font-semibold text-foreground">{req.requestor_name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        wants to <span className="font-mono text-primary">{req.type}</span> "{req.filename}"
                                    </p>
                                </div>
                                <div className="flex gap-1">
                                    {loading ? (
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    ) : (
                                        <>
                                            <Button 
                                                size="icon" 
                                                variant="ghost" 
                                                className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-100" 
                                                onClick={() => handleAction(req.req_id, 'APPROVED')}
                                                title="Approve"
                                            >
                                                <Check className="h-4 w-4" />
                                            </Button>
                                            <Button 
                                                size="icon" 
                                                variant="ghost" 
                                                className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-100" 
                                                onClick={() => handleAction(req.req_id, 'REJECTED')}
                                                title="Reject"
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
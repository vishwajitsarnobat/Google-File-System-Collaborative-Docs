import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { Bell, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function NotificationCenter() {
    const { user } = useAuth();
    const [requests, setRequests] = useState<any[]>([]);

    const fetchRequests = async () => {
        if (!user) return;
        try {
            const res = await axios.get(`http://localhost:3000/api/access/notifications/${user.user_id}`);
            setRequests(res.data);
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        fetchRequests();
        const interval = setInterval(fetchRequests, 5000);
        return () => clearInterval(interval);
    }, [user]);

    const handleAction = async (req_id: string, action: 'APPROVED' | 'REJECTED') => {
        try {
            await axios.post("http://localhost:3000/api/access/approve", { req_id, action });
            setRequests(prev => prev.filter(r => r.req_id !== req_id));
        } catch (e) { alert("Action failed"); }
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="relative">
                    <Bell className="h-4 w-4" />
                    {requests.length > 0 && (
                        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500" />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
                <div className="grid gap-4">
                    <div className="space-y-2">
                        <h4 className="font-medium leading-none">Access Requests</h4>
                        <p className="text-sm text-muted-foreground">
                            {requests.length === 0 ? "No pending requests." : "Users requesting access to your files."}
                        </p>
                    </div>
                    <div className="grid gap-2">
                        {requests.map((req) => (
                            <div key={req.req_id} className="flex items-center justify-between border-b pb-2 last:border-0">
                                <div className="text-sm">
                                    <p className="font-medium">{req.requestor_name}</p>
                                    <p className="text-xs text-muted-foreground">wants to {req.type} "{req.filename}"</p>
                                </div>
                                <div className="flex gap-1">
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-green-600" onClick={() => handleAction(req.req_id, 'APPROVED')}>
                                        <Check className="h-4 w-4" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-red-600" onClick={() => handleAction(req.req_id, 'REJECTED')}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
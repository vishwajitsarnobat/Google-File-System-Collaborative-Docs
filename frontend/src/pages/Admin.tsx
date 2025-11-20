import { useEffect, useState } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Server, Activity, Clock, Play, Power, GitMerge, Cpu, Crown, Terminal } from "lucide-react";

export default function Admin() {
    const [data, setData] = useState<any>({ masters: [], chunkservers: [], current_leader: null });
    const [loading, setLoading] = useState<number | null>(null);

    const fetchStatus = async () => {
        try {
            const res = await axios.get("http://localhost:3000/api/admin/cluster-status");
            setData(res.data);
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 1000);
        return () => clearInterval(interval);
    }, []);

    const toggleNode = async (port: number, action: 'start' | 'stop') => {
        setLoading(port);
        try {
            await axios.post(`http://localhost:3000/api/admin/node/${action}/${port}`);
            setTimeout(fetchStatus, 500);
        } catch(e) { alert("Command failed"); }
        finally { setLoading(null); }
    };

    return (
        <div className="p-6 md:p-10 space-y-10 max-w-[1600px] mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">System Internals</h1>
                    <p className="text-muted-foreground">Real-time monitoring of the distributed cluster topology.</p>
                </div>
                <div className="flex gap-3 text-sm font-medium bg-card p-2 rounded-lg border shadow-sm">
                    <span className="flex items-center gap-2 px-2"><div className="h-2 w-2 rounded-full bg-green-500"/> Healthy</span>
                    <span className="flex items-center gap-2 px-2 border-l"><div className="h-2 w-2 rounded-full bg-red-500"/> Offline</span>
                    <span className="flex items-center gap-2 px-2 border-l"><div className="h-2 w-2 rounded-full bg-yellow-500"/> Leader</span>
                </div>
            </div>

            {/* CONTROL PLANE */}
            <section className="space-y-6">
                <div className="flex items-center gap-3 pb-2 border-b">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                        <Crown className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold">Control Plane</h2>
                        <p className="text-sm text-muted-foreground">Master Nodes • Bully Election Algorithm</p>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {data.masters.map((m: any) => {
                        const isRunning = m.status === "RUNNING";
                        const isLeader = m.node_id === data.current_leader;
                        
                        return (
                            <Card key={m.node_id} className={`relative overflow-hidden transition-all duration-300 border-2 ${isLeader ? 'border-yellow-400/60 dark:border-yellow-400/40 shadow-[0_0_20px_-5px_rgba(250,204,21,0.3)]' : 'hover:border-primary/50'} ${!isRunning ? 'opacity-70 grayscale border-dashed' : ''}`}>
                                {isLeader && <div className="absolute top-0 right-0 bg-yellow-400/20 text-yellow-600 dark:text-yellow-400 px-3 py-1 rounded-bl-lg text-[10px] font-bold tracking-wider border-b border-l border-yellow-400/30">LEADER</div>}
                                
                                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                                    <div className="flex flex-col gap-1">
                                        <CardTitle className="text-base font-mono tracking-tight">Master-{m.node_id}</CardTitle>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded w-fit ${isRunning ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                            {m.status}
                                        </span>
                                    </div>
                                    <Button 
                                        variant={isRunning ? "destructive" : "default"} 
                                        size="icon" 
                                        className={`h-8 w-8 rounded-full transition-transform active:scale-95 ${!isRunning ? 'bg-green-600 hover:bg-green-700' : ''}`}
                                        onClick={() => toggleNode(m.node_id, isRunning ? 'stop' : 'start')}
                                        disabled={loading === m.node_id}
                                    >
                                        {loading === m.node_id ? <Activity className="h-4 w-4 animate-spin" /> : (isRunning ? <Power className="h-4 w-4" /> : <Play className="h-4 w-4" />)}
                                    </Button>
                                </CardHeader>
                                
                                <CardContent className="space-y-4">
                                    {isRunning && m.algo_status ? (
                                        <div className="space-y-3">
                                            <div className="flex justify-between text-xs border-b pb-2">
                                                <span className="text-muted-foreground">Thread Pool</span>
                                                <span className="font-mono">{m.algo_status.active_threads} active</span>
                                            </div>
                                            <div className="flex justify-between text-xs items-center">
                                                <span className="text-muted-foreground">Election State</span>
                                                <Badge variant="outline" className={`h-5 text-[10px] ${m.algo_status.election_state === 'VOTING' ? 'animate-pulse bg-yellow-100 dark:bg-yellow-900/20' : ''}`}>
                                                    {m.algo_status.election_state}
                                                </Badge>
                                            </div>
                                            <div className="space-y-1.5">
                                                <div className="flex justify-between text-[10px] uppercase font-semibold text-muted-foreground">
                                                    <span>Request Load</span>
                                                    <span>{m.algo_status.total_requests} ops</span>
                                                </div>
                                                <Progress value={(m.algo_status.total_requests % 100)} className="h-1.5" />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-28 flex flex-col items-center justify-center text-muted-foreground/40 gap-2 border-2 border-dashed rounded-lg bg-muted/20">
                                            <Power className="h-8 w-8" />
                                            <span className="text-xs font-mono font-bold">TERMINATED</span>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            </section>

            {/* DATA PLANE */}
            <section className="space-y-6">
                 <div className="flex items-center gap-3 pb-2 border-b">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                        <Server className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold">Data Plane</h2>
                        <p className="text-sm text-muted-foreground">Chunkservers • Berkeley Clock Synchronization</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {data.chunkservers.map((cs: any) => {
                        const isRunning = cs.status === "RUNNING";
                        const metrics = cs.metrics || {};
                        const drift = Math.abs(metrics.clock_offset || 0);
                        const isDrifted = drift > 0.5;

                        return (
                            <Card key={cs.port} className={`transition-all duration-300 border hover:border-primary/50 ${!isRunning ? 'opacity-60 bg-muted/30' : 'bg-card'}`}>
                                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                                    <div className="flex flex-col gap-1">
                                        <CardTitle className="text-sm font-mono">Node-{cs.port}</CardTitle>
                                    </div>
                                    <div className={`h-2 w-2 rounded-full ${isRunning ? (isDrifted ? 'bg-yellow-500 animate-pulse' : 'bg-green-500') : 'bg-red-500'}`} />
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {isRunning ? (
                                        <>
                                            <div className={`p-3 rounded-md border flex flex-col gap-1 ${isDrifted ? 'bg-red-50 border-red-100 dark:bg-red-900/10 dark:border-red-900/30' : 'bg-muted/40'}`}>
                                                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                                    <Clock className="h-3 w-3" /> Clock Offset
                                                </div>
                                                <div className={`text-lg font-mono font-bold tracking-tight ${isDrifted ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                                                    {metrics.clock_offset?.toFixed(4)}s
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <div className="flex justify-between text-[10px] font-semibold text-muted-foreground">
                                                    <span className="flex items-center gap-1"><Cpu className="h-3 w-3"/> Load</span>
                                                    <span>{metrics.total_requests || 0}</span>
                                                </div>
                                                <Progress value={Math.min((metrics.total_requests || 0) * 2, 100)} className="h-1.5" />
                                            </div>
                                            
                                            <Button 
                                                variant="destructive" 
                                                size="sm" 
                                                className="w-full h-8 text-xs mt-1"
                                                onClick={() => toggleNode(cs.port, 'stop')}
                                            >
                                                Kill Process
                                            </Button>
                                        </>
                                    ) : (
                                        <div className="flex flex-col gap-3">
                                            <div className="h-16 flex items-center justify-center text-xs text-muted-foreground font-mono border rounded bg-muted/50">
                                                OFFLINE
                                            </div>
                                            <Button variant="default" size="sm" className="w-full h-8 bg-green-600 hover:bg-green-700" onClick={() => toggleNode(cs.port, 'start')}>
                                                <Play className="h-3 w-3 mr-2" /> Revive
                                            </Button>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </section>
            
            <Card className="bg-slate-950 dark:bg-black border-slate-800 shadow-inner">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-mono text-slate-400 flex items-center gap-2">
                        <Terminal className="h-4 w-4" />
                        System Logs
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="font-mono text-xs text-green-400/90 space-y-1">
                        <p>{">"} Initializing GFS Admin Console...</p>
                        <p>{">"} Connection established to Middleware [::1]:3000</p>
                        <p>{">"} <span className="text-blue-400">Load Balancer:</span> Active (Weighted Round-Robin strategy)</p>
                        <p>{">"} <span className="text-yellow-400">Consensus:</span> {data.current_leader ? `Leader Elected (Node ${data.current_leader})` : "ELECTION IN PROGRESS"}</p>
                        <p>{">"} <span className="text-purple-400">Fault Tolerance:</span> {data.masters.filter((m:any) => m.status === "RUNNING").length}/3 Masters, {data.chunkservers.filter((c:any) => c.status === "RUNNING").length}/4 Chunkservers available.</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
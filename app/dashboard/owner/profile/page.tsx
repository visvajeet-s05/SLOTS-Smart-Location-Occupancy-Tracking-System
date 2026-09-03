"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import {
    User,
    Mail,
    Phone,
    MapPin,
    ShieldCheck,
    Building,
    Calendar,
    Camera,
    Edit2,
    Lock,
    ChevronRight,
    Verified,
    AlertCircle,
    FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function OwnerProfilePage() {
    const { data: session } = useSession();
    const [profile, setProfile] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await fetch("/api/owner/profile");
                const data = await res.json();
                setProfile(data);
            } catch (error) {
                console.error("Failed to fetch profile:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchProfile();
    }, []);

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#030303] text-white p-8">
                <div className="w-full max-w-[1440px] mx-auto space-y-8">
                    <Skeleton className="h-48 w-full rounded-3xl bg-white/5" />
                    <div className="grid w-full grid-cols-1 md:grid-cols-3 gap-8">
                        <Skeleton className="h-64 rounded-3xl bg-white/5" />
                        <Skeleton className="h-64 md:col-span-2 rounded-3xl bg-white/5" />
                    </div>
                </div>
            </div>
        );
    }

    const user = profile?.user;
    const verification = profile?.ownerverification;

    return (
        <div className="min-h-screen bg-[#030303] text-white selection:bg-purple-500/30">
            {/* Decorative Background */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-900/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-900/10 rounded-full blur-[120px]" />
            </div>

            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                 className="relative w-full max-w-[1440px] mx-auto px-6 lg:px-8 pt-0 pb-20 space-y-8"
            >
                {/* Header / Hero Section */}
                <motion.div variants={itemVariants} className="relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-blue-600/20 rounded-[2rem] blur-2xl group-hover:blur-3xl transition-all opacity-50" />
                    <div className="relative bg-white/[0.03] border border-white/10 backdrop-blur-xl rounded-[2rem] p-8 md:p-12 overflow-hidden">
                        <div className="absolute top-0 right-0 p-8">
                            <Badge className={
                                verification?.status === 'APPROVED'
                                    ? "bg-green-500/10 text-green-400 border-green-500/20 px-4 py-1.5 rounded-full"
                                    : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20 px-4 py-1.5 rounded-full"
                            }>
                                {verification?.status === 'APPROVED' ? (
                                    <span className="flex items-center gap-2"><Verified size={14} /> Verified Partner</span>
                                ) : (
                                    <span className="flex items-center gap-2"><AlertCircle size={14} /> Pending Business Verification</span>
                                )}
                            </Badge>
                        </div>

                        <div className="flex flex-col md:flex-row items-center gap-8">
                            <div className="relative group/avatar">
                                <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 p-1 shadow-xl shadow-indigo-500/20">
                                    <div className="w-full h-full rounded-full bg-[#030303] flex items-center justify-center overflow-hidden border border-white/10">
                                        <User size={64} className="text-white/80" />
                                    </div>
                                </div>
                                <button className="absolute bottom-2 right-2 p-2 bg-white text-black rounded-full shadow-xl hover:scale-110 transition-all opacity-100 border border-white/20">
                                    <Camera size={18} />
                                </button>
                            </div>

                            <div className="text-center md:text-left space-y-4">
                                <div>
                                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2">
                                        {user?.name}
                                    </h1>
                                    <p className="text-gray-400 text-lg flex items-center justify-center md:justify-start gap-2">
                                        <Building size={18} className="text-purple-400" />
                                        {profile?.businessName || "Your Enterprise Name"}
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 pt-2">
                                    <Button className="bg-white text-black hover:bg-white/90 rounded-xl px-6 h-11 transition-all hover:translate-y-[-2px]">
                                        <Edit2 size={16} className="mr-2" /> Edit Profile
                                    </Button>
                                    <Button variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10 rounded-xl h-11">
                                        Public View
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Left Column: Contact & Security */}
                    <div className="space-y-8">
                        <motion.div variants={itemVariants}>
                            <Card className="bg-white/[0.03] border-white/10 backdrop-blur-xl rounded-3xl overflow-hidden pt-4 transition-all">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <ShieldCheck size={20} className="text-purple-400" />
                                        Account Security
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-between group hover:border-purple-500/30 transition-all cursor-pointer">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
                                                <Lock size={18} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">Password</p>
                                                <p className="text-xs text-gray-500">Updated 2 months ago</p>
                                            </div>
                                        </div>
                                        <ChevronRight size={16} className="text-gray-600 group-hover:text-white transition-all" />
                                    </div>

                                    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-between group hover:border-blue-500/30 transition-all cursor-pointer">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                                                <Mail size={18} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">Secondary Email</p>
                                                <p className="text-xs text-gray-500">Not configured</p>
                                            </div>
                                        </div>
                                        <ChevronRight size={16} className="text-gray-600 group-hover:text-white transition-all" />
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>

                        <motion.div variants={itemVariants}>
                            <Card className="bg-white/[0.03] border-white/10 backdrop-blur-xl rounded-3xl overflow-hidden pt-4">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <Verified size={20} className="text-emerald-400" />
                                        KYC Documents
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                                        <FileText size={20} className="text-emerald-400" />
                                        <div>
                                            <p className="text-sm font-medium">Business License</p>
                                            <p className="text-xs text-gray-500">Verified on Jan 12, 2026</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl">
                                        <AlertCircle size={18} className="text-amber-400" />
                                        <div>
                                            <p className="text-sm font-medium">Verification Status</p>
                                            <p className="text-xs text-gray-500">Awaiting final admin review on tax and identity documentation.</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    </div>

                    {/* Right Column: Detailed Info */}
                    <div className="md:col-span-2 w-full space-y-8">
                        <motion.div variants={itemVariants}>
                            <Card className="bg-white/[0.03] border-white/10 backdrop-blur-xl rounded-3xl overflow-hidden pt-4">
                                <CardHeader>
                                    <CardTitle className="text-lg">Contact Information</CardTitle>
                                </CardHeader>
                                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-8">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Email Address</label>
                                        <div className="flex items-center gap-3 text-gray-200">
                                            <Mail size={18} className="text-purple-400" />
                                            <span className="font-medium">{user?.email}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Phone Number</label>
                                        <div className="flex items-center gap-3 text-gray-200">
                                            <Phone size={18} className="text-purple-400" />
                                            <span className="font-medium">{profile?.phone || "Not set"}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-1 md:col-span-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Business Address</label>
                                        <div className="flex items-center gap-3 text-gray-200">
                                            <MapPin size={18} className="text-purple-400" />
                                            <span className="font-medium">{profile?.address || profile?.parkinglot?.[0]?.address || "Address details not provided"}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Member Since</label>
                                        <div className="flex items-center gap-3 text-gray-200">
                                            <Calendar size={18} className="text-purple-400" />
                                            <span className="font-medium">{new Date(user?.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>

                        <motion.div variants={itemVariants}>
                            <Card className="bg-white/[0.03] border-white/10 backdrop-blur-xl rounded-3xl overflow-hidden pt-4">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle className="text-lg">Connected Properties</CardTitle>
                                    <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20">{profile?.parkinglot?.length || 0} Assets</Badge>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {profile?.parkinglot?.length > 0 ? (
                                        profile.parkinglot.map((lot: any) => (
                                            <div key={lot.id} className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-between group hover:border-purple-500/20 transition-all">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
                                                        <Building size={24} />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-white group-hover:text-purple-300 transition-all">{lot.name}</p>
                                                        <p className="text-xs text-gray-500 mt-0.5">ID: {lot.id}</p>
                                                    </div>
                                                </div>
                                                <Badge className={
                                                    lot.status === 'ACTIVE'
                                                        ? "bg-green-500/10 text-green-400 border-green-500/20"
                                                        : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                                                }>
                                                    {lot.status}
                                                </Badge>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 bg-white/[0.01] rounded-2xl border border-dashed border-white/10">
                                            <Building size={32} className="mx-auto text-white/10 mb-2" />
                                            <p className="text-sm text-gray-500 italic">No parking lots connected to this profile yet.</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </motion.div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

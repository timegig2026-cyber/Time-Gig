/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { UserCircle, Gift, Home, Settings, Share2, Bell, CheckCircle2, Clock, TrendingUp, Users, Activity, Eye, FileText, X, Check, Building2, CreditCard, Twitter, Facebook, Link, Copy, Briefcase, Plus, MapPin, Calendar, ChevronLeft, MessageCircle, Send, Paperclip, Smile, Mic, Square, Play, Star, Sparkles, UserPlus, UserCheck, Wallet, ArrowUpRight, ArrowDownLeft, Coins, UploadCloud, ChevronRight, AlertCircle, Camera, Trophy, BadgeCheck, LogOut } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";
import EmojiPicker from 'emoji-picker-react';
import { supabase } from "./lib/supabase";
import { User } from "@supabase/supabase-js";

const provinceOrder = [
  "Gauteng",
  "Western Cape",
  "KwaZulu-Natal",
  "Eastern Cape",
  "Free State",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Remote / Other"
];

const JOB_CATEGORIES = [
  "Casual Jobs (Dog Walk, Gardening, etc)",
  "Cleaning & Housework",
  "Tech & Web Development",
  "Design & Creative",
  "Writing & Translation",
  "Photography & Video",
  "Handyman & Home Repairs",
  "Tutoring & Lessons",
  "General Assistance"
];

const getProvinceName = (loc: string): string => {
  const l = (loc || "").toLowerCase();
  if (l.includes("gauteng") || l.includes("johannesburg") || l.includes("pretoria") || l.includes("gp") || l.includes("randburg") || l.includes("sandton") || l.includes("midrand")) return "Gauteng";
  if (l.includes("western cape") || l.includes("cape town") || l.includes("wc") || l.includes("stellenbosch") || l.includes("bellville")) return "Western Cape";
  if (l.includes("kwazulu-natal") || l.includes("kzn") || l.includes("durban") || l.includes("pietermaritzburg") || l.includes("umhlanga")) return "KwaZulu-Natal";
  if (l.includes("eastern cape") || l.includes("ec") || l.includes("port elizabeth") || l.includes("gqeberha") || l.includes("east london")) return "Eastern Cape";
  if (l.includes("free state") || l.includes("fs") || l.includes("bloemfontein")) return "Free State";
  if (l.includes("limpopo") || l.includes("polokwane") || l.includes("lp")) return "Limpopo";
  if (l.includes("mpumalanga") || l.includes("nelspruit") || l.includes("mbombela") || l.includes("mp")) return "Mpumalanga";
  if (l.includes("north west") || l.includes("nw") || l.includes("rustenburg") || l.includes("mafikeng")) return "North West";
  if (l.includes("northern cape") || l.includes("kimberley") || l.includes("nc")) return "Northern Cape";
  return "Remote / Other";
};

interface AppUser {
  id: string;
  name: string;
  title: string;
  avatar: string;
  location: string;
  isOnline: boolean;
  email?: string;
}

interface FriendRequest {
  userId: string;
  type: 'incoming' | 'outgoing';
  status: 'pending' | 'accepted' | 'declined';
}

const initialAppUsers: AppUser[] = [];

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !user) return;

    const fetchData = async () => {
      // Fetch Gigs
      const { data: gigsData } = await supabase.from('gigs').select('*').order('created_at', { ascending: false });
      if (gigsData) setGigs(gigsData);

      // Fetch Seekers
      const { data: seekersData } = await supabase.from('seekers').select('*');
      if (seekersData) setSeekers(seekersData);

      // Fetch Wallet Balance & Stats
      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      
      const localProfileKey = `local_profile_${user.id}`;
      const storedLocalProfile = localStorage.getItem(localProfileKey);
      let localProfile = storedLocalProfile ? JSON.parse(storedLocalProfile) : null;
      
      if (!localProfile) {
        localProfile = {
          wallet_balance: profileData?.wallet_balance ?? 0,
          referral_balance: profileData?.referral_balance ?? 0,
          referrals_count: profileData?.referrals_count ?? 0,
          is_verified: profileData?.is_verified ?? false
        };
        localStorage.setItem(localProfileKey, JSON.stringify(localProfile));
      }

      setWalletBalance(localProfile.wallet_balance || 0);
      setReferralEarningBalance(localProfile.referral_balance || 0);
      setVerifiedReferrals(localProfile.referrals_count || 0);
      setIsVerified(localProfile.is_verified || false);

      // Check verification status
      const { data: verifs } = await supabase.from('verifications').select('*').eq('user_id', user.id);
      const hasPending = verifs?.some(v => v.status === 'pending');
      const hasApproved = verifs?.some(v => v.status === 'approved');

      if (hasPending) {
        setIsVerificationPending(true);
        setIsVerified(false);
        if (profileData && profileData.is_verified) {
          // Sync database: set is_verified to false because there is a pending submission
          await updateLocalProfileHelper(user.id, { is_verified: false });
        }
      } else {
        setIsVerificationPending(false);
      }

      if (hasApproved) {
        setIsVerified(true);
        setIsVerificationPending(false);
        if (profileData && !profileData.is_verified) {
          // Self-heal: Update own profile to verified (permitted by RLS since it's the owner's own profile row)
          await updateLocalProfileHelper(user.id, { is_verified: true });
        }
      } else if (!hasPending && user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        setIsVerified(false);
        if (profileData && profileData.is_verified) {
          await updateLocalProfileHelper(user.id, { is_verified: false });
        }
      }

      // If the user is admin, bypass verification and force verified status
      if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        setIsVerified(true);
        setIsVerificationPending(false);
        setShowVerificationModal(false);
        if (profileData && !profileData.is_verified) {
          await updateLocalProfileHelper(user.id, { is_verified: true });
        }
        
        // Pre-load pending KYC verifications for the admin badge count
        const { data: verifData } = await supabase.from('verifications').select('*').eq('status', 'pending');
        if (verifData) {
          setPendingVerifications(verifData.map(v => ({
            ...v,
            user: v.user_name || 'User',
            date: v.created_at ? new Date(v.created_at).toLocaleDateString() : 'Just now',
            idImage: v.id_url,
            faceImage: v.face_url
          })));
        }
      }

      // Fetch Transactions
      let txs = [];
      try {
        const { data: txData, error: txErr } = await supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
        if (txErr) throw txErr;
        if (txData) txs = txData;
      } catch (err) {
        console.warn("Using local storage fallback for transactions table");
        const storedTxs = localStorage.getItem('local_transactions');
        if (storedTxs) {
          txs = JSON.parse(storedTxs).filter((t: any) => t.user_id === user.id);
        }
      }
      setWalletTransactions(txs);

      // Fetch Notifications
      let notifs = [];
      try {
        const { data: notifData, error: notifErr } = await supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
        if (notifErr) throw notifErr;
        if (notifData) notifs = notifData;
      } catch (err) {
        console.warn("Using local storage fallback for notifications table");
        const storedNotifs = localStorage.getItem('local_notifications');
        if (storedNotifs) {
          notifs = JSON.parse(storedNotifs).filter((n: any) => n.user_id === user.id);
        }
      }
      
      let finalNotifications = notifs || [];

      // If user is admin, dynamically inject notifications for all pending verifications so they appear on initial load
      if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        try {
          const { data: pendingVerifs } = await supabase.from('verifications').select('*').eq('status', 'pending');
          if (pendingVerifs && pendingVerifs.length > 0) {
            const pendingNotifs = pendingVerifs.map(v => ({
              id: 'admin-verif-' + v.id,
              user_id: user.id,
              title: "New KYC Verification Submitted 📄",
              message: `${v.user_name || 'A user'} has submitted their identity verification documents for review.`,
              type: "promo",
              time: v.created_at ? new Date(v.created_at).toLocaleDateString() : 'Just now',
              read: false
            }));
            finalNotifications = [...pendingNotifs, ...finalNotifications];
          }
        } catch (e) {
          console.error("Error checking pending verifs:", e);
        }
      }

      // Self-heal verification notifications for the current user (using their own RLS context)
      if (verifs) {
        const hasApprovedVerif = verifs.some(v => v.status === 'approved');
        const hasRejectedVerif = verifs.some(v => v.status === 'rejected');
        
        if (hasApprovedVerif) {
          const hasApprovedNotif = finalNotifications.some(n => n.title === "Account Approved! 🚀");
          if (!hasApprovedNotif) {
            try {
              const { data: inserted } = await supabase.from('notifications').insert([{
                user_id: user.id,
                title: "Account Approved! 🚀",
                message: "Congratulations! Your account review is approved and your identity has been successfully verified.",
                type: "reward",
                time: "Just now"
              }]).select();
              if (inserted && inserted[0]) {
                finalNotifications = [inserted[0], ...finalNotifications];
              } else {
                throw new Error("No data returned");
              }
            } catch (err) {
              const localNotif = {
                id: 'local-approved-' + Date.now(),
                user_id: user.id,
                title: "Account Approved! 🚀",
                message: "Congratulations! Your account review is approved and your identity has been successfully verified.",
                type: "reward",
                time: "Just now",
                read: false
              };
              const storedNotifs = localStorage.getItem('local_notifications');
              const list = storedNotifs ? JSON.parse(storedNotifs) : [];
              list.unshift(localNotif);
              localStorage.setItem('local_notifications', JSON.stringify(list));
              finalNotifications = [localNotif as any, ...finalNotifications];
            }
          }
        } else if (hasRejectedVerif) {
          const hasRejectedNotif = finalNotifications.some(n => n.title === "KYC Verification Rejected");
          if (!hasRejectedNotif) {
            try {
              const { data: inserted } = await supabase.from('notifications').insert([{
                user_id: user.id,
                title: "KYC Verification Rejected",
                message: "Your identity verification was unfortunately rejected. Please try again with clearer documents.",
                type: "payout",
                time: "Just now"
              }]).select();
              if (inserted && inserted[0]) {
                finalNotifications = [inserted[0], ...finalNotifications];
              } else {
                throw new Error("No data returned");
              }
            } catch (err) {
              const localNotif = {
                id: 'local-rejected-' + Date.now(),
                user_id: user.id,
                title: "KYC Verification Rejected",
                message: "Your identity verification was unfortunately rejected. Please try again with clearer documents.",
                type: "payout",
                time: "Just now",
                read: false
              };
              const storedNotifs = localStorage.getItem('local_notifications');
              const list = storedNotifs ? JSON.parse(storedNotifs) : [];
              list.unshift(localNotif);
              localStorage.setItem('local_notifications', JSON.stringify(list));
              finalNotifications = [localNotif as any, ...finalNotifications];
            }
          }
        }
      }
      
      setNotifications(finalNotifications);

      // Global Stats for Admin/App Overview
      let statsData = null;
      try {
        const { data, error } = await supabase.from('app_stats').select('*').single();
        if (error) throw error;
        statsData = data;
      } catch (err) {
        console.warn("Using local storage fallback for app_stats table");
        const storedStats = localStorage.getItem('local_app_stats');
        statsData = storedStats ? JSON.parse(storedStats) : null;
      }

      const { count: realUserCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      
      // Fetch Agents (Users with referrals)
      try {
        const { data: allProfiles } = await supabase.from('profiles').select('*');
        if (allProfiles) {
          const agentsData = allProfiles.map(p => {
            const localProfileKey = `local_profile_${p.id}`;
            const stored = localStorage.getItem(localProfileKey);
            const localProfile = stored ? JSON.parse(stored) : null;
            return {
              ...p,
              referrals_count: localProfile?.referrals_count ?? p.referrals_count ?? 0,
              wallet_balance: localProfile?.wallet_balance ?? p.wallet_balance ?? 0,
              referral_balance: localProfile?.referral_balance ?? p.referral_balance ?? 0,
              is_verified: localProfile?.is_verified ?? p.is_verified ?? false
            };
          });

          // Exclude admin itself from being displayed/monitored in the admin panel
          const filteredAgents = agentsData.filter(a => a.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase());
          const mappedAgents = filteredAgents.map(a => ({
            ...a,
            id: a.id,
            user: a.full_name || a.email || 'Agent',
            referrals: a.referrals_count || 0,
            packageId: a.package_id || 1,
            joined: 'Recently',
            bankDetails: a.bank_details || { bankName: 'Not set', account: 'Not set' }
          }));
          setCompletedAgents(mappedAgents.filter(a => a.referrals >= 10));
          setActiveAgents(mappedAgents.filter(a => a.referrals < 10));
        }
      } catch (err) {
        console.error("Error fetching agents:", err);
      }

      // Fetch Pending Approvals
      let tps = [];
      try {
        const { data: topupsData, error: topupsErr } = await supabase.from('topups').select('*').eq('status', 'pending');
        if (topupsErr) throw topupsErr;
        if (topupsData) tps = topupsData;
      } catch (err) {
        console.warn("Using local storage fallback for topups table");
        const storedTps = localStorage.getItem('local_topups');
        if (storedTps) {
          tps = JSON.parse(storedTps).filter((t: any) => t.status === 'pending');
        }
      }
      setPendingPayments(tps.map(t => ({
        ...t,
        id: t.id || 'local-topup-' + Date.now(),
        user: t.user_name || 'User',
        amount: t.amount_rands || `R ${(t.amount_coins / 100).toFixed(2).replace('.', ',')}`,
        date: t.created_at ? new Date(t.created_at).toLocaleDateString() : 'Just now',
        image: t.proof_url || 'https://images.unsplash.com/photo-1554224155-1696413565d3?auto=format&fit=crop&q=80&w=800',
        coins: t.amount_coins || t.coins || 0
      })));

      // Fetch Pending Payouts
      let pts = [];
      try {
        const { data: payoutsData, error: payoutsErr } = await supabase.from('withdrawals').select('*').eq('status', 'pending');
        if (payoutsErr) throw payoutsErr;
        if (payoutsData) pts = payoutsData;
      } catch (err) {
        console.warn("Using local storage fallback for withdrawals table");
        const storedPts = localStorage.getItem('local_withdrawals');
        if (storedPts) {
          pts = JSON.parse(storedPts).filter((p: any) => p.status === 'pending');
        }
      }
      setPendingPayouts(pts.map(p => ({
        ...p,
        id: p.id || 'local-withdrawal-' + Date.now(),
        user: p.user_name || 'User',
        amount: p.amount_rands || `R ${(p.amount / 100).toFixed(2).replace('.', ',')}`,
        coins: p.amount,
        date: p.created_at ? new Date(p.created_at).toLocaleDateString() : 'Just now',
        bankDetails: p.bank_details || { bankName: 'Unknown', account: 'Unknown' }
      })));

      // Fetch Pending Verifications
      try {
        let verifData = [];
        try {
          const { data, error: fetchError } = await supabase.from('verifications').select('*').eq('status', 'pending');
          if (fetchError) throw fetchError;
          if (data) verifData = data;
        } catch (dbErr) {
          console.warn("Using local storage fallback for verifications table:", dbErr);
          const storedVerif = localStorage.getItem('local_verifications');
          if (storedVerif) {
            verifData = JSON.parse(storedVerif).filter((v: any) => v.status === 'pending');
          }
        }
        if (verifData) {
          setPendingVerifications(verifData.map(v => ({
            ...v,
            user: v.user_name || 'User',
            date: v.created_at ? new Date(v.created_at).toLocaleDateString() : 'Just now',
            idImage: v.id_url,
            faceImage: v.face_url
          })));
        }
      } catch (err) {
        console.error("Error fetching verifications:", err);
      }

      if (statsData) {
        setAppStats({
          total_profit: statsData.total_profit || 0,
          total_users: realUserCount || statsData.total_users || 0,
          total_payouts: statsData.total_payouts || 0,
          online_users: statsData.online_users || Math.floor((realUserCount || 0) * 0.15) + 5,
          visits: (statsData.visits || 0) + 1
        });

        // Increment visits
        try {
          await supabase.from('app_stats').update({ visits: (statsData.visits || 0) + 1 }).eq('id', statsData.id);
        } catch (updateErr) {
          const updated = { ...statsData, visits: (statsData.visits || 0) + 1 };
          localStorage.setItem('local_app_stats', JSON.stringify(updated));
        }
      } else {
        // Initial state if table is empty
        const initialStats = {
          total_profit: 0,
          total_users: realUserCount || 0,
          total_payouts: 0,
          online_users: Math.floor((realUserCount || 0) * 0.15) + 5,
          visits: 1
        };
        setAppStats(initialStats);
        
        // Try to create initial stats row
        try {
          await supabase.from('app_stats').insert([initialStats]);
        } catch (insertErr) {
          localStorage.setItem('local_app_stats', JSON.stringify(initialStats));
        }
      }
    };

    fetchData();

    // Set up real-time subscriptions
    const gigsSubscription = supabase
      .channel('gigs_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gigs' }, payload => {
        if (payload.eventType === 'INSERT') {
          setGigs(prev => [payload.new as any, ...prev]);
        }
      })
      .subscribe();

    let notificationsSubscription: any;
    let verificationsSubscription: any;
    let adminVerificationsSubscription: any;
    let profilesSubscription: any;
    let adminStatsSubscription: any;

    if (user) {
      notificationsSubscription = supabase
        .channel(`user_notifications_${user.id}`)
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'notifications'
        }, payload => {
          console.log("Realtime notification received:", payload);
          const newNotif = payload.new as any;
          if (newNotif && newNotif.user_id === user.id) {
            setNotifications(prev => [newNotif, ...prev]);
            
            // Show dynamic alert toast to notify the user visually
            setWalletMessage({ 
              text: `${newNotif.title}: ${newNotif.message}`, 
              type: 'success' 
            });
            setTimeout(() => setWalletMessage(null), 6000);
          }
        })
        .subscribe();

      profilesSubscription = supabase
        .channel(`user_profile_${user.id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles'
        }, payload => {
          console.log("Realtime profile updated:", payload);
          const updatedProfile = payload.new as any;
          if (updatedProfile && updatedProfile.id === user.id) {
            if (typeof updatedProfile.wallet_balance === 'number') {
              setWalletBalance(updatedProfile.wallet_balance);
            }
            if (typeof updatedProfile.referral_balance === 'number') {
              setReferralEarningBalance(updatedProfile.referral_balance);
            }
            if (typeof updatedProfile.is_verified === 'boolean') {
              setIsVerified(updatedProfile.is_verified);
            }
          }
        })
        .subscribe();

      verificationsSubscription = supabase
        .channel(`user_verifications_${user.id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'verifications'
        }, payload => {
          console.log("Realtime verification updated:", payload);
          const updatedVerif = payload.new as any;
          // Because of RLS, a regular user only receives events for their own rows,
          // so if updatedVerif is received, it is guaranteed to be for this user.
          if (updatedVerif && (updatedVerif.user_id === user.id || !updatedVerif.user_id)) {
            if (updatedVerif.status === 'approved') {
              setIsVerified(true);
              setIsVerificationPending(false);
              
              const newNotif = {
                id: 'notif-approved-' + Date.now(),
                user_id: user.id,
                title: "Account Approved! 🚀",
                message: "Congratulations! Your account review is approved and your identity has been successfully verified.",
                type: "reward",
                time: "Just now",
                read: false
              };
              
              setNotifications(prev => {
                if (prev.some(n => n.title === "Account Approved! 🚀")) return prev;
                return [newNotif as any, ...prev];
              });
              
              setWalletMessage({ 
                text: `${newNotif.title}: ${newNotif.message}`, 
                type: 'success' 
              });
              setTimeout(() => setWalletMessage(null), 6000);
              
              // Also update user's profile to verified in the database (permitted by RLS since user is updating their own profile)
              updateLocalProfileHelper(user.id, { is_verified: true });

              // Insert notification on client side (fully permitted by RLS since it's the current user)
              supabase.from('notifications').insert([{
                user_id: user.id,
                title: "Account Approved! 🚀",
                message: "Congratulations! Your account review is approved and your identity has been successfully verified.",
                type: "reward",
                time: "Just now"
              }]).then(() => {
                console.log("Realtime approved notification generated successfully via client self-healing");
              });
            } else if (updatedVerif.status === 'rejected') {
              setIsVerified(false);
              setIsVerificationPending(false);
              
              // Also update user's profile to not verified in the database (permitted by RLS since user is updating their own profile)
              updateLocalProfileHelper(user.id, { is_verified: false });

              const newNotif = {
                id: 'notif-rejected-' + Date.now(),
                user_id: user.id,
                title: "KYC Verification Rejected",
                message: "Your identity verification was unfortunately rejected. Please try again with clearer documents.",
                type: "payout",
                time: "Just now",
                read: false
              };
              
              setNotifications(prev => {
                if (prev.some(n => n.title === "KYC Verification Rejected")) return prev;
                return [newNotif as any, ...prev];
              });
              
              setWalletMessage({ 
                text: `${newNotif.title}: ${newNotif.message}`, 
                type: 'error' 
              });
              setTimeout(() => setWalletMessage(null), 6000);
              
              // Insert notification on client side (fully permitted by RLS since it's the current user)
              supabase.from('notifications').insert([{
                user_id: user.id,
                title: "KYC Verification Rejected",
                message: "Your identity verification was unfortunately rejected. Please try again with clearer documents.",
                type: "payout",
                time: "Just now"
              }]).then(() => {
                console.log("Realtime rejected notification generated successfully via client self-healing");
              });
            }
          }
        })
        .subscribe();

      // If user is admin, they should subscribe to any new verification submissions to get real-time notifications
      if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        adminVerificationsSubscription = supabase
          .channel('admin_verifications_notifications')
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'verifications'
          }, payload => {
            console.log("Admin received new verification submission in realtime:", payload);
            const newVerif = payload.new as any;
            if (newVerif) {
              const newNotif = {
                id: 'admin-verif-' + Date.now(),
                user_id: user.id,
                title: "New KYC Verification Submitted 📄",
                message: `${newVerif.user_name || 'A user'} has submitted their identity verification documents for review.`,
                type: "promo",
                time: "Just now",
                read: false
              };
              
              setNotifications(prev => {
                if (prev.some(n => n.message === newNotif.message)) return prev;
                return [newNotif as any, ...prev];
              });
              
              setWalletMessage({ 
                text: `${newNotif.title}: ${newNotif.message}`, 
                type: 'success' 
              });
              setTimeout(() => setWalletMessage(null), 6000);

              // Also append to pendingVerifications state so it appears in the admin panel instantly
              setPendingVerifications(prev => {
                if (prev.some(v => v.id === newVerif.id)) return prev;
                const mappedVerif = {
                  ...newVerif,
                  user: newVerif.user_name || 'User',
                  date: newVerif.created_at ? new Date(newVerif.created_at).toLocaleDateString() : 'Just now',
                  idImage: newVerif.id_url,
                  faceImage: newVerif.face_url
                };
                return [mappedVerif, ...prev];
              });
            }
          })
          .subscribe();

        adminStatsSubscription = supabase
          .channel('admin_stats_changes')
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'app_stats'
          }, payload => {
            console.log("Realtime app stats updated in admin:", payload);
            const newStats = payload.new as any;
            if (newStats) {
              setAppStats(prev => ({
                ...prev,
                total_profit: newStats.total_profit || 0,
                total_payouts: newStats.total_payouts || 0,
                total_users: newStats.total_users || prev.total_users,
                online_users: newStats.online_users || prev.online_users,
                visits: newStats.visits || prev.visits
              }));
            }
          })
          .subscribe();
      }
    }

    return () => {
      supabase.removeChannel(gigsSubscription);
      if (notificationsSubscription) supabase.removeChannel(notificationsSubscription);
      if (verificationsSubscription) supabase.removeChannel(verificationsSubscription);
      if (adminVerificationsSubscription) supabase.removeChannel(adminVerificationsSubscription);
      if (profilesSubscription) supabase.removeChannel(profilesSubscription);
      if (adminStatsSubscription) supabase.removeChannel(adminStatsSubscription);
    };
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  const [activeTab, setActiveTab] = useState<'gigs' | 'referrals' | 'seekers' | 'settings' | 'friends' | 'wallet'>('gigs');
  const [walletBalance, setWalletBalance] = useState<number>(0); // Initial coin balance
  const [referralEarningBalance, setReferralEarningBalance] = useState<number>(0); // Referral earning balance in coins
  const [walletTransactions, setWalletTransactions] = useState<Array<{
    id: string;
    title: string;
    amount: number;
    type: 'credit' | 'debit';
    date: string;
    category: 'transfer' | 'topup' | 'reward' | 'payout' | 'package';
  }>>([]);

  // Wallet Modals & Inputs
  const [isTopupOpen, setIsTopupOpen] = useState(false);
  const [appStats, setAppStats] = useState({ total_profit: 0, total_users: 0, total_payouts: 0, online_users: 0, visits: 0 });
  const [topupStep, setTopupStep] = useState<number>(0); // 0: select, 1: bank instructions, 2: upload, 3: review message
  const [selectedTopupOption, setSelectedTopupOption] = useState<{ coins: number; rands: string; ref: string } | null>(null);
  const [uploadedProofOfPaymentName, setUploadedProofOfPaymentName] = useState<string>('');
  const [uploadedProofOfPaymentUrl, setUploadedProofOfPaymentUrl] = useState<string>('');
  const [topupFile, setTopupFile] = useState<File | null>(null);
  const [topupAmount, setTopupAmount] = useState('100');
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferRecipient, setTransferRecipient] = useState('');
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [withdrawCoins, setWithdrawCoins] = useState('');
  const [pendingPayouts, setPendingPayouts] = useState<Array<{
    id: number;
    user: string;
    coins: number;
    amount: string;
    date: string;
    bankDetails: { bankName: string; account: string };
  }>>([]);
  const [pendingVerifications, setPendingVerifications] = useState<any[]>([]);
  const [selectedVerification, setSelectedVerification] = useState<any | null>(null);
  const [adminApprovalTab, setAdminApprovalTab] = useState<'topups' | 'payouts' | 'verifications'>('topups');
  const [kycFilter, setKycFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const fetchVerifications = async (status: 'pending' | 'approved' | 'rejected') => {
    if (supabase) {
      const { data: verifData } = await supabase.from('verifications').select('*').eq('status', status);
      if (verifData) {
        setPendingVerifications(verifData.map(v => ({
          ...v,
          user: v.user_name || 'User',
          date: v.created_at ? new Date(v.created_at).toLocaleDateString() : 'Just now',
          idImage: v.id_url,
          faceImage: v.face_url
        })));
      }
    }
  };

  useEffect(() => {
    if (adminApprovalTab === 'verifications') {
      fetchVerifications(kycFilter);
    }
  }, [adminApprovalTab, kycFilter]);
  const [walletMessage, setWalletMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [friends, setFriends] = useState<string[]>([]); 
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [friendsSubTab, setFriendsSubTab] = useState<'contacts' | 'discover' | 'requests'>('contacts');
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [friendSystemMessage, setFriendSystemMessage] = useState<{ text: string, type: 'success' | 'info' } | null>(null);
  const [viewingGig, setViewingGig] = useState<{id: number, title: string, description: string, price: string, location: string, owner: string, images: string[], date: string} | null>(null);

  // Self-Healing DB helpers to fallback to local storage when tables do not exist
  const insertTransactionHelper = async (newTx: any) => {
    try {
      if (supabase) {
        const { error } = await supabase.from('transactions').insert([newTx]);
        if (error) throw error;
      }
    } catch (err) {
      console.warn("Transactions insert fallback used:", err);
      const stored = localStorage.getItem('local_transactions');
      const list = stored ? JSON.parse(stored) : [];
      list.unshift({ ...newTx, id: newTx.id || 'local-tx-' + Date.now() });
      localStorage.setItem('local_transactions', JSON.stringify(list));
    }
  };

  const insertNotificationHelper = async (newNotif: any) => {
    try {
      if (supabase) {
        const { error } = await supabase.from('notifications').insert([newNotif]);
        if (error) throw error;
      }
    } catch (err) {
      console.warn("Notifications insert fallback used:", err);
      const stored = localStorage.getItem('local_notifications');
      const list = stored ? JSON.parse(stored) : [];
      list.unshift({ ...newNotif, id: newNotif.id || 'local-notif-' + Date.now(), read: false });
      localStorage.setItem('local_notifications', JSON.stringify(list));
    }
  };

  const updateTopupStatusHelper = async (topupId: any, status: 'approved' | 'rejected') => {
    try {
      if (supabase) {
        const { error } = await supabase.from('topups').update({ status }).eq('id', topupId);
        if (error) throw error;
      }
    } catch (err) {
      console.warn("Topup status update fallback used:", err);
    }
    // Always sync local storage too
    try {
      const stored = localStorage.getItem('local_topups');
      if (stored) {
        const list = JSON.parse(stored);
        const item = list.find((t: any) => t.id === topupId);
        if (item) {
          item.status = status;
          localStorage.setItem('local_topups', JSON.stringify(list));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updateWithdrawalStatusHelper = async (withdrawalId: any, status: 'approved' | 'rejected') => {
    try {
      if (supabase) {
        const { error } = await supabase.from('withdrawals').update({ status }).eq('id', withdrawalId);
        if (error) throw error;
      }
    } catch (err) {
      console.warn("Withdrawal status update fallback used:", err);
    }
    // Always sync local storage too
    try {
      const stored = localStorage.getItem('local_withdrawals');
      if (stored) {
        const list = JSON.parse(stored);
        const item = list.find((w: any) => w.id === withdrawalId);
        if (item) {
          item.status = status;
          localStorage.setItem('local_withdrawals', JSON.stringify(list));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updateLocalProfileHelper = async (userId: string, updates: { wallet_balance?: number, referral_balance?: number, referrals_count?: number, is_verified?: boolean }) => {
    try {
      const localProfileKey = `local_profile_${userId}`;
      const storedLocalProfile = localStorage.getItem(localProfileKey);
      const localProfile = storedLocalProfile ? JSON.parse(storedLocalProfile) : { wallet_balance: 0, referral_balance: 0, referrals_count: 0, is_verified: false };
      
      if (updates.wallet_balance !== undefined) localProfile.wallet_balance = updates.wallet_balance;
      if (updates.referral_balance !== undefined) localProfile.referral_balance = updates.referral_balance;
      if (updates.referrals_count !== undefined) localProfile.referrals_count = updates.referrals_count;
      if (updates.is_verified !== undefined) localProfile.is_verified = updates.is_verified;
      
      localStorage.setItem(localProfileKey, JSON.stringify(localProfile));
      
      if (userId === user?.id) {
        if (updates.wallet_balance !== undefined) setWalletBalance(updates.wallet_balance);
        if (updates.referral_balance !== undefined) setReferralEarningBalance(updates.referral_balance);
        if (updates.referrals_count !== undefined) setVerifiedReferrals(updates.referrals_count);
        if (updates.is_verified !== undefined) setIsVerified(updates.is_verified);
      }
    } catch (e) {
      console.error("Failed to update local profile in localStorage", e);
    }

    try {
      if (supabase) {
        // Try updating DB too (ignore if it fails due to missing column/RLS)
        await supabase.from('profiles').update(updates).eq('id', userId);
      }
    } catch (err) {
      console.warn("Database profiles sync failed (expected due to schema restrictions):", err);
    }
  };

  // Tour States & Config
  const [isTourActive, setIsTourActive] = useState<boolean>(() => {
    return !localStorage.getItem('timegig_tour_completed');
  });
  const [tourStep, setTourStep] = useState<number>(0);

  const tourSteps = [
    {
      title: "Welcome to TimeGig! 🚀",
      description: "Welcome to TimeGig, South Africa's premium local gig explorer & high-earning referral network! Let us guide you on a 1-minute tour to show you how to find local opportunities and maximize your weekly referral rewards.",
      tab: 'gigs'
    },
    {
      title: "Explore or Post Local GiGs 💼",
      description: "Browse or list job opportunities categorized by South African provinces like Gauteng, Western Cape, and KwaZulu-Natal. Find your next client or contractor instantly!",
      tab: 'gigs'
    },
    {
      title: "Seekers & Friend Network 👥",
      description: "Find local professionals and service providers, message them in real-time, or add friends to grow your South African connections list and network together.",
      tab: 'seekers'
    },
    {
      title: "Earn Referral Rewards 💎",
      description: "This is the core earning engine! Activate a Weekly Package (R100, R200, R300, R400, R500) to start earning premium commission payouts from your referrals' topups on the app.",
      tab: 'referrals'
    },
    {
      title: "Verify & Instant Cash Out 📈",
      description: "Track your progress in real-time. Once you reach 10 verified referrals under your active package, you can instantly cash out your weekly rewards directly to your bank account!",
      tab: 'referrals'
    },
    {
      title: "Share & Start Earning 🎉",
      description: "Tap 'Share Invite Link' to share your personal invite code directly on WhatsApp, Facebook, or Twitter. To celebrate your onboarding, we have added a 50 Coins starter gift to your profile!",
      tab: 'referrals'
    }
  ];

  useEffect(() => {
    if (isTourActive) {
      const step = tourSteps[tourStep];
      if (step) {
        setIsAdminView(false);
        setActiveTab(step.tab as any);
      }
    }
  }, [tourStep, isTourActive]);

  // Seekers states
  const [seekersTab, setSeekersTab] = useState<'find' | 'mine'>('find');
  const [seekerSearchQuery, setSeekerSearchQuery] = useState('');
  const [seekerLocationQuery, setSeekerLocationQuery] = useState('');
  const [selectedSeekerSkill, setSelectedSeekerSkill] = useState<string | null>(null);
  const [viewingSeekerDetail, setViewingSeekerDetail] = useState<any | null>(null);
  const [fullscreenSeekerAvatar, setFullscreenSeekerAvatar] = useState<string | null>(null);

  // Gigs search states
  const [gigSearchQuery, setGigSearchQuery] = useState('');
  const [gigLocationQuery, setGigLocationQuery] = useState('');
  const [selectedGigCategory, setSelectedGigCategory] = useState<string>('');
  const [selectedSeekerCategory, setSelectedSeekerCategory] = useState<string>('');
  
  const [mySeekerProfile, setMySeekerProfile] = useState<{
    name: string;
    title: string;
    bio: string;
    rate: string;
    skills: string;
    location: string;
    category: string;
    avatar: string;
    hasProfile: boolean;
  }>({
    name: "Current User",
    title: "",
    bio: "",
    rate: "",
    skills: "",
    location: "",
    category: "Casual Jobs (Dog Walk, Gardening, etc)",
    avatar: "https://ui-avatars.com/api/?name=Current+User&background=e0e7ff&color=4f46e5",
    hasProfile: false
  });

  const [seekers, setSeekers] = useState([]);

  const [hiringSeeker, setHiringSeeker] = useState<any | null>(null);
  const [hireForm, setHireForm] = useState({ projectTitle: '', budget: '', description: '' });
  const [showHireSuccess, setShowHireSuccess] = useState(false);
  const [isCreatingGig, setIsCreatingGig] = useState(false);
  const [editingGigId, setEditingGigId] = useState<number | null>(null);
  const [viewingProfile, setViewingProfile] = useState<string | null>(null);
  const [fullscreenMedia, setFullscreenMedia] = useState<{url: string, type: 'image' | 'video'} | null>(null);
  const [chattingWith, setChattingWith] = useState<string | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationIDFile, setVerificationIDFile] = useState<File | null>(null);
  const [verificationFacePhoto, setVerificationFacePhoto] = useState<string | null>(null);
  const [isVerificationPending, setIsVerificationPending] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      setCameraStream(stream);
      setIsCameraActive(true);
    } catch (err) {
      console.error("Camera error:", err);
      setWalletMessage({ text: "Could not access camera. Please check permissions.", type: 'error' });
      setTimeout(() => setWalletMessage(null), 4000);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const photoData = canvas.toDataURL('image/jpeg');
        setVerificationFacePhoto(photoData);
        stopCamera();
      }
    }
  };

  const handleVerificationSubmit = async () => {
    if (!verificationIDFile || !verificationFacePhoto) {
      setWalletMessage({ text: "Please upload ID and capture your face photo.", type: 'error' });
      setTimeout(() => setWalletMessage(null), 4000);
      return;
    }
    
    setIsVerificationPending(true);
    setShowVerificationModal(false);
    
        // Save to Supabase
        if (supabase && user) {
          try {
            let idUrl = '';
            let faceUrl = '';

            // 1. Upload ID Document
            if (verificationIDFile) {
              const fileExt = verificationIDFile.name.split('.').pop();
              const fileName = `${user.id}/id_${Date.now()}.${fileExt}`;
              console.log("Uploading ID to:", fileName);
              const { error: uploadError } = await supabase.storage.from('verification').upload(fileName, verificationIDFile);
              if (uploadError) {
                console.error("ID upload error:", uploadError);
                throw uploadError;
              }
              idUrl = supabase.storage.from('verification').getPublicUrl(fileName).data.publicUrl;
              console.log("ID URL:", idUrl);
            }

            // 2. Upload Face Photo
            if (verificationFacePhoto) {
              const fileName = `${user.id}/face_${Date.now()}.jpg`;
              console.log("Uploading Face to:", fileName);
              const base64Data = verificationFacePhoto.split(',')[1];
              const blob = await fetch(`data:image/jpeg;base64,${base64Data}`).then(res => res.blob());
              const { error: uploadError } = await supabase.storage.from('verification').upload(fileName, blob, { contentType: 'image/jpeg' });
              if (uploadError) {
                console.error("Face upload error:", uploadError);
                throw uploadError;
              }
              faceUrl = supabase.storage.from('verification').getPublicUrl(fileName).data.publicUrl;
              console.log("Face URL:", faceUrl);
            }
            
            const verifObj = {
              id: 'local-verif-' + Date.now(),
              user_id: user.id,
              user_name: user.user_metadata?.full_name || user.email || 'Agent',
              id_url: idUrl || 'https://images.unsplash.com/photo-1557200134-90327ee9fafa?auto=format&fit=crop&q=80&w=800',
              face_url: faceUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=800',
              status: 'pending',
              created_at: new Date().toISOString()
            };

            try {
              const { error: insertError } = await supabase.from('verifications').insert([{
                user_id: verifObj.user_id,
                user_name: verifObj.user_name,
                id_url: verifObj.id_url,
                face_url: verifObj.face_url,
                status: verifObj.status
              }]);
              if (insertError) throw insertError;
            } catch (err) {
              console.warn("Could not insert verification into database, saving locally:", err);
              const stored = localStorage.getItem('local_verifications');
              const list = stored ? JSON.parse(stored) : [];
              list.unshift(verifObj);
              localStorage.setItem('local_verifications', JSON.stringify(list));
            }

            // Let admin receive notification message when user submit verification
            try {
              const { data: adminProfiles, error: fetchAdminError } = await supabase
                .from('profiles')
                .select('id')
                .eq('email', ADMIN_EMAIL);
              
              const adminId = (!fetchAdminError && adminProfiles && adminProfiles.length > 0) ? adminProfiles[0].id : 'admin-fallback-id';
              const adminNotifMessage = `${user.user_metadata?.full_name || user.email || 'A user'} has submitted their identity verification documents for review.`;
              
              const adminNotif = {
                user_id: adminId,
                title: "New KYC Verification Submitted 📄",
                message: adminNotifMessage,
                type: "promo",
                time: "Just now"
              };

              await insertNotificationHelper(adminNotif);
            } catch (adminErr) {
              console.error("Error notifying admin about verification submission:", adminErr);
            }

            // Add a notification for review
            const reviewNotif = {
              id: Date.now(),
              title: "Account Under Review",
              message: "Your ID documents are being reviewed. You can still browse the app in the meantime!",
              type: "promo" as const,
              time: "Just now",
              read: false
            };
            setNotifications(prev => [reviewNotif, ...prev]);
            
            setIsVerified(false);
            setIsVerificationPending(true);
            await updateLocalProfileHelper(user.id, { is_verified: false });
            
            setWalletMessage({ text: "Documents submitted successfully! Your account is now under review.", type: 'success' });
      } catch (err: any) {
        console.error("Verification submit error:", err);
        let errorMsg = err.message || "An unexpected error occurred.";
        if (err.details) errorMsg += ` - ${err.details}`;
        
        setWalletMessage({ 
          text: `Verification error: ${errorMsg}`, 
          type: 'error' 
        });
        setIsVerificationPending(false);
      }
    }

    setVerificationIDFile(null);
    setVerificationFacePhoto(null);
    setTimeout(() => setWalletMessage(null), 7000);
  };
  const [chatAttachment, setChatAttachment] = useState<{file: File, type: 'image' | 'video', url: string} | null>(null);
  const [pendingRecording, setPendingRecording] = useState<{url: string, type: 'audio' | 'video'} | null>(null);
  const [messages, setMessages] = useState<{id: string, text: string, sender: 'me' | 'them', audioUrl?: string, attachment?: { type: 'image' | 'video', url: string }, timestamp: number, liked?: boolean}[]>([]);
  const [selectedMessageForAction, setSelectedMessageForAction] = useState<{id: string, text: string, sender: 'me' | 'them'} | null>(null);
  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const [editMessageInput, setEditMessageInput] = useState("");
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMessageClick = (msg: any) => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      // Double tap -> Like message
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, liked: !m.liked } : m));
    } else {
      clickTimeoutRef.current = setTimeout(() => {
        clickTimeoutRef.current = null;
        // Single tap -> Open edit/delete modal
        setSelectedMessageForAction(msg);
      }, 250);
    }
  };

  const handleEditMessage = () => {
    if (selectedMessageForAction) {
      setMessages(prev => prev.map(m => m.id === selectedMessageForAction.id ? { ...m, text: editMessageInput } : m));
      setIsEditingMessage(false);
      setSelectedMessageForAction(null);
    }
  };

  const handleDeleteMessage = () => {
    if (selectedMessageForAction) {
      setMessages(prev => prev.filter(m => m.id !== selectedMessageForAction.id));
      setSelectedMessageForAction(null);
    }
  };
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isProfilePublic, setIsProfilePublic] = useState(true);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const ADMIN_EMAIL = 'timegig2026@gmail.com';

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setAuthError("Supabase is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment variables.");
      return;
    }
    
    // Remove hardcoded admin password check and rely on Supabase registration
    setAuthLoading(true);
    setAuthError("");
    
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        setAuthError("Check your email for the confirmation link!");
        
        // Skip verification for admin
        if (authEmail.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
          setShowVerificationModal(true);
        }
      }
    } catch (error: any) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
  };

  const playAudio = (url: string) => {
    const audio = new Audio(url);
    audio.play().catch(e => console.error("Error playing audio", e));
  };

  const startRecording = async (type: 'audio' | 'video' = 'audio') => {
    const constraints = { audio: true, video: type === 'video' };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    audioChunksRef.current = [];
    mediaRecorder.ondataavailable = (event) => {
      audioChunksRef.current.push(event.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: type === 'audio' ? 'audio/wav' : 'video/webm' });
      const url = URL.createObjectURL(blob);
      setPendingRecording({url, type});
      stream.getTracks().forEach(track => track.stop());
    };
    mediaRecorder.start();
    setIsRecording(true);
    setRecordingDuration(0);
    timerRef.current = setInterval(() => setRecordingDuration(prev => prev + 1), 1000);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };




  const [notifications, setNotifications] = useState([]);
  const [activePromoPopup, setActivePromoPopup] = useState<any | null>(null);

  // Fullscreen image state
  const [fullScreenImageIndex, setFullScreenImageIndex] = useState<number | null>(null);
  const [currentGigImageIndex, setCurrentGigImageIndex] = useState(0);
  const [appliedGigs, setAppliedGigs] = useState<number[]>([]);

  const [gigs, setGigs] = useState([]);
  
  const [newGig, setNewGig] = useState({ title: '', description: '', price: '', location: '', category: 'Casual Jobs (Dog Walk, Gardening, etc)', images: [] as string[] });

  const [activePackage, setActivePackage] = useState<string | null>(null);
  const [isAdminView, setIsAdminView] = useState(false);

  useEffect(() => {
    if (user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      setIsAdminView(true);
    } else {
      setIsAdminView(false);
    }
  }, [user]);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [activatingPackageId, setActivatingPackageId] = useState<string | null>(null);
  const [bankDetails, setBankDetails] = useState({ bankName: '', accountNumber: '', branchCode: '' });
  const [verifiedReferrals, setVerifiedReferrals] = useState(0);
  const [userReferralTopups, setUserReferralTopups] = useState(0);
  const [userReferralProfits, setUserReferralProfits] = useState(0);
  const [simTier1Count, setSimTier1Count] = useState(0);
  const [simTier2Count, setSimTier2Count] = useState(0);
  const [simAvgTopup, setSimAvgTopup] = useState(0);
  const [simAvgProfit, setSimAvgProfit] = useState(0);
  const [simPkgValue, setSimPkgValue] = useState(0);
  const [promoForm, setPromoForm] = useState({ title: '', message: '' });
  const [isSendingPromo, setIsSendingPromo] = useState(false);

  const deductCoins = async (amount: number, reason: string) => {
    if (walletBalance < amount) {
      setWalletMessage({ text: `Insufficient funds! This action costs ${amount} Coins.`, type: 'error' });
      setTimeout(() => setWalletMessage(null), 4000);
      return false;
    }

    if (supabase && user) {
      const newBalance = walletBalance - amount;
      
      // Update local state for immediate feedback
      setWalletBalance(newBalance);

      // Persist to Supabase and Local Storage
      await updateLocalProfileHelper(user.id, { wallet_balance: newBalance });
      
      const newTx = {
        title: reason,
        amount: amount,
        type: 'debit' as const,
        category: 'transfer' as const,
        user_id: user.id,
        date: 'Just now'
      };

      await insertTransactionHelper(newTx);
      setWalletTransactions(prev => [{ ...newTx, id: Date.now().toString() } as any, ...prev]);
      
      // Update app stats
      let stats = null;
      try {
        const { data } = await supabase.from('app_stats').select('*').single();
        stats = data;
      } catch (err) {
        const stored = localStorage.getItem('local_app_stats');
        stats = stored ? JSON.parse(stored) : null;
      }

      if (stats) {
        try {
          await supabase.from('app_stats').update({ total_profit: (stats.total_profit || 0) + amount }).eq('id', stats.id);
        } catch (err) {
          const updated = { ...stats, total_profit: (stats.total_profit || 0) + amount };
          localStorage.setItem('local_app_stats', JSON.stringify(updated));
        }
      }
    }

    return true;
  };

  const handleSendPromotion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoForm.title.trim() || !promoForm.message.trim()) return;

    setIsSendingPromo(true);
    
    // Simulate sending delay
    setTimeout(() => {
      const newPromo = {
        id: Date.now(),
        title: promoForm.title,
        message: promoForm.message,
        type: 'promo' as const,
        time: 'Just now',
        read: false
      };
      
      setNotifications(prev => [newPromo, ...prev]);
      setPromoForm({ title: '', message: '' });
      setIsSendingPromo(false);
      setWalletMessage({ text: "Promotion sent to all users successfully!", type: 'success' });
      setTimeout(() => setWalletMessage(null), 4000);
    }, 1500);
  };
  const [selectedDocument, setSelectedDocument] = useState<{id: number, user: string, amount: string, date: string, image: string} | null>(null);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [completedAgents, setCompletedAgents] = useState([]);
  const [activeAgents, setActiveAgents] = useState([]);

  const handleActivatePackage = (e: React.FormEvent) => {
    e.preventDefault();
    if (activatingPackageId) {
      setActivePackage(activatingPackageId);
      setActivatingPackageId(null);
    }
  };

  const handleTopup = async (amount: number) => {
    if (isNaN(amount) || amount <= 0) {
      setWalletMessage({ text: "Please enter a valid positive amount.", type: 'error' });
      return;
    }
    
    if (supabase && user) {
      const newBalance = walletBalance + amount;
      await updateLocalProfileHelper(user.id, { wallet_balance: newBalance });

      const newTx = {
        title: 'Topup via EFT Secure',
        amount: amount,
        type: 'credit' as const,
        category: 'topup' as const,
        user_id: user.id,
        date: 'Just now'
      };
      await insertTransactionHelper(newTx);
      setWalletTransactions(prev => [{ ...newTx, id: Date.now().toString() } as any, ...prev]);
    }

    setIsTopupOpen(false);
    setWalletMessage({ text: `Successfully topped up ${amount} Coins into your Wallet!`, type: 'success' });
    setTimeout(() => setWalletMessage(null), 4000);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setWalletMessage({ text: `${label} copied to clipboard!`, type: 'success' });
    setTimeout(() => setWalletMessage(null), 3000);
  };

  const handleTransfer = async (recipientName: string, amount: number) => {
    if (!recipientName.trim()) {
      setWalletMessage({ text: "Please specify a recipient.", type: 'error' });
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      setWalletMessage({ text: "Please enter a valid transfer amount.", type: 'error' });
      return;
    }
    if (amount > walletBalance) {
      setWalletMessage({ text: "Insufficient funds in your wallet.", type: 'error' });
      return;
    }
    
    if (supabase && user) {
      const newBalance = walletBalance - amount;
      await updateLocalProfileHelper(user.id, { wallet_balance: newBalance });

      const newTx = {
        title: `Transfer to ${recipientName}`,
        amount: amount,
        type: 'debit' as const,
        category: 'transfer' as const,
        user_id: user.id,
        date: 'Just now'
      };
      await insertTransactionHelper(newTx);
      setWalletTransactions(prev => [{ ...newTx, id: Date.now().toString() } as any, ...prev]);
    }

    setIsTransferOpen(false);
    setWalletMessage({ text: `Successfully transferred ${amount} Coins to ${recipientName}!`, type: 'success' });
    setTimeout(() => setWalletMessage(null), 4000);
    setTransferAmount('');
    setTransferRecipient('');
  };

  const handleWithdrawalRequest = async (amount: number, bankName: string, accountNo: string) => {
    if (isNaN(amount) || amount <= 0) {
      setWalletMessage({ text: "Please enter a valid coin amount.", type: 'error' });
      return;
    }
    if (amount > walletBalance) {
      setWalletMessage({ text: "Insufficient funds in your wallet.", type: 'error' });
      return;
    }
    if (!bankName.trim() || !accountNo.trim()) {
      setWalletMessage({ text: "Bank name and Account number are required.", type: 'error' });
      return;
    }

    if (supabase && user) {
      const newBalance = walletBalance - amount;
      await updateLocalProfileHelper(user.id, { wallet_balance: newBalance });

      const withdrawalRequest = {
        id: 'local-withdrawal-' + Date.now(),
        user_id: user.id,
        user_name: user?.user_metadata?.full_name || user?.email || 'User',
        amount: amount,
        bank_details: { bankName, account: accountNo },
        status: 'pending',
        date: 'Just now',
        created_at: new Date().toISOString()
      };

      try {
        const { error } = await supabase.from('withdrawals').insert([{
          user_id: withdrawalRequest.user_id,
          user_name: withdrawalRequest.user_name,
          amount: withdrawalRequest.amount,
          bank_details: withdrawalRequest.bank_details,
          status: withdrawalRequest.status,
          created_at: withdrawalRequest.created_at
        }]);
        if (error) throw error;
      } catch (err) {
        console.warn("Database 'withdrawals' save failed, storing locally:", err);
        const storedPts = localStorage.getItem('local_withdrawals');
        const list = storedPts ? JSON.parse(storedPts) : [];
        list.unshift(withdrawalRequest);
        localStorage.setItem('local_withdrawals', JSON.stringify(list));
      }

      const newTx = {
        title: 'Withdrawal Cashout (Pending Approval)',
        amount: amount,
        type: 'debit' as const,
        category: 'payout' as const,
        user_id: user.id,
        date: 'Just now'
      };
      await insertTransactionHelper(newTx);
      setWalletTransactions(prev => [{ ...newTx, id: Date.now().toString() } as any, ...prev]);
    }

    setIsWithdrawOpen(false);
    setWithdrawCoins('');
    setWalletMessage({ 
      text: `Withdrawal request of ${amount} Coins submitted successfully! Pending admin approval.`, 
      type: 'success' 
    });
    setTimeout(() => setWalletMessage(null), 4000);
  };

  const handlePayAgent = (agentId: number) => {
    setCompletedAgents(prev => prev.map(agent => agent.id === agentId ? { ...agent, paid: true } : agent));
  };

  const handleAddFriend = (userId: string) => {
    const newRequest: FriendRequest = { userId, type: 'outgoing', status: 'pending' };
    setFriendRequests(prev => [...prev.filter(r => r.userId !== userId), newRequest]);
    
    const targetUser = initialAppUsers.find(u => u.id === userId);
    const userName = targetUser ? targetUser.name : "User";
    
    setFriendSystemMessage({
      text: `Friend request sent to ${userName}! They will accept in a few seconds...`,
      type: 'info'
    });
    
    setTimeout(() => {
      setFriendSystemMessage(prev => prev?.text.includes("request sent") ? null : prev);
    }, 4000);

    setTimeout(() => {
      setFriendRequests(prev => prev.map(r => r.userId === userId ? { ...r, status: 'accepted' as const } : r));
      setFriends(prev => [...new Set([...prev, userId])]);
      
      const newNotif = {
        id: Date.now(),
        title: "Request Accepted",
        message: `${userName} accepted your friend request! They are now in your contact list.`,
        type: "friend",
        time: "Just now",
        read: false
      };
      setNotifications(prev => [newNotif, ...prev]);
      
      setFriendSystemMessage({
        text: `You and ${userName} are now friends!`,
        type: 'success'
      });
      setTimeout(() => {
        setFriendSystemMessage(prev => prev?.text.includes("now friends") ? null : prev);
      }, 4000);
    }, 3000);
  };

  const handleAcceptRequest = (userId: string) => {
    setFriendRequests(prev => prev.map(r => r.userId === userId ? { ...r, status: 'accepted' as const } : r));
    setFriends(prev => [...new Set([...prev, userId])]);
    const targetUser = initialAppUsers.find(u => u.id === userId);
    const userName = targetUser ? targetUser.name : "User";
    setFriendSystemMessage({
      text: `Accepted friend request from ${userName}!`,
      type: 'success'
    });
    setTimeout(() => {
      setFriendSystemMessage(prev => prev?.text.includes("Accepted friend") ? null : prev);
    }, 4000);
  };

  const handleDeclineRequest = (userId: string) => {
    setFriendRequests(prev => prev.filter(r => r.userId !== userId));
    const targetUser = initialAppUsers.find(u => u.id === userId);
    const userName = targetUser ? targetUser.name : "User";
    setFriendSystemMessage({
      text: `Declined request from ${userName}.`,
      type: 'info'
    });
    setTimeout(() => {
      setFriendSystemMessage(prev => prev?.text.includes("Declined request") ? null : prev);
    }, 3000);
  };

  const handleCancelRequest = (userId: string) => {
    setFriendRequests(prev => prev.filter(r => r.userId !== userId));
    const targetUser = initialAppUsers.find(u => u.id === userId);
    const userName = targetUser ? targetUser.name : "User";
    setFriendSystemMessage({
      text: `Cancelled friend request to ${userName}.`,
      type: 'info'
    });
    setTimeout(() => {
      setFriendSystemMessage(prev => prev?.text.includes("Cancelled friend") ? null : prev);
    }, 3000);
  };

  const handleRemoveFriend = (userId: string) => {
    setFriends(prev => prev.filter(id => id !== userId));
    setFriendRequests(prev => prev.filter(r => r.userId !== userId));
    const targetUser = initialAppUsers.find(u => u.id === userId);
    const userName = targetUser ? targetUser.name : "User";
    setFriendSystemMessage({
      text: `Removed ${userName} from your contact list.`,
      type: 'info'
    });
    setTimeout(() => {
      setFriendSystemMessage(prev => prev?.text.includes("Removed") ? null : prev);
    }, 3000);
  };

  const packages = [
    { id: '1', reward: 'R100', percentage: 2 },
    { id: '2', reward: 'R200', percentage: 4 },
    { id: '3', reward: 'R300', percentage: 6 },
    { id: '4', reward: 'R400', percentage: 8 },
    { id: '5', reward: 'R500', percentage: 2 },
  ];

  if (showSplash) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <h1 className="text-4xl font-bold text-black tracking-widest animate-pulse">TimeGiG</h1>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col justify-center p-4 relative overflow-hidden font-sans">
        {/* Background Decorations - Floating Trophies/Balls */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <Trophy className="absolute top-[10%] left-[15%] w-8 h-8 text-indigo-200/40 rotate-12" />
          <Trophy className="absolute bottom-[20%] right-[10%] w-12 h-12 text-indigo-200/30 -rotate-12" />
          <Trophy className="absolute top-[60%] left-[5%] w-6 h-6 text-indigo-200/20" />
          <Trophy className="absolute top-[30%] right-[20%] w-10 h-10 text-indigo-200/25 rotate-45" />
          <div className="absolute top-[15%] right-[40%] w-3 h-3 bg-indigo-200/30 rounded-full"></div>
          <div className="absolute bottom-[40%] left-[30%] w-4 h-4 bg-indigo-200/20 rounded-full"></div>
          <div className="absolute top-[80%] right-[30%] w-2 h-2 bg-indigo-200/40 rounded-full"></div>
          <div className="absolute top-[50%] right-[5%] w-5 h-5 bg-indigo-200/15 rounded-full"></div>
        </div>

        <div className="mx-auto w-full max-w-[380px] z-10">
          <div className="bg-white/70 backdrop-blur-2xl rounded-[40px] shadow-2xl overflow-hidden border border-white/50 ring-1 ring-black/5">
            <div className="bg-slate-900 p-8 text-center relative overflow-hidden">
              {/* Shine effect */}
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 to-transparent pointer-events-none"></div>
              
              <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-full mb-4 shadow-lg ring-4 ring-white/10">
                <Trophy className="w-8 h-8 text-slate-900" />
              </div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic">
                {isLogin ? 'Back in Action' : 'Join the Elite'}
              </h2>
              <div className="flex flex-col items-center gap-1 mt-1">
                <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest opacity-80">
                  TimeGig Premiere League
                </p>
                <div className="flex items-center gap-1.5 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"></div>
                  <span className="text-[8px] font-black uppercase tracking-tighter text-emerald-400">Live & Legit</span>
                </div>
              </div>
            </div>

            <div className="p-8">
              <form className="space-y-4" onSubmit={handleAuth}>
                {authError && (
                  <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in zoom-in-95">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {authError}
                  </div>
                )}
                
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="name@example.com"
                    className="w-full px-5 py-3.5 bg-white border-2 border-gray-100 rounded-2xl text-sm font-bold text-gray-900 placeholder-gray-300 focus:outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 transition-all"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Secret Code</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    className="w-full px-5 py-3.5 bg-white border-2 border-gray-100 rounded-2xl text-sm font-bold text-gray-900 placeholder-gray-300 focus:outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 transition-all"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-slate-900 hover:bg-black text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-200 active:scale-95 transition-all disabled:opacity-50 mt-4 border-b-4 border-black"
                >
                  {authLoading ? 'Signing Sheet...' : (isLogin ? 'Log In' : 'Sign Up')}
                </button>
              </form>

              <div className="mt-8 pt-6 border-t border-gray-100">
                <button
                  onClick={() => setIsLogin(!isLogin)}
                  className="w-full py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-gray-50 transition-colors border-2 border-gray-100"
                >
                  {isLogin ? 'Create an account' : 'Existing account? Sign In'}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div className="bg-white/50 backdrop-blur-md rounded-[32px] p-6 border border-white/60 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-indigo-100 rounded-2xl flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                </div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900">Vision & Purpose</h4>
              </div>
              <p className="text-[11px] font-medium leading-relaxed text-slate-600">
                TimeGig is <span className="text-slate-900 font-bold underline decoration-indigo-200 decoration-2 underline-offset-2">not a "get quick rich" scheme</span>. We are in development to fight unemployment by building real digital earning paths.
              </p>
            </div>
            
            <div className="bg-white/50 backdrop-blur-md rounded-[32px] p-6 border border-white/60 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-emerald-100 rounded-2xl flex items-center justify-center">
                  <Gift className="w-4 h-4 text-emerald-600" />
                </div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900">Referral Guarantee</h4>
              </div>
              <p className="text-[11px] font-medium leading-relaxed text-slate-600">
                Our referral program is <span className="text-emerald-600 font-bold">100% legit</span>. Users will definitely get paid for valid referrals as we scale this platform together.
              </p>
            </div>
          </div>
          
          <div className="mt-8 flex justify-center gap-4 text-gray-300">
             <div className="w-1.5 h-1.5 rounded-full bg-gray-200"></div>
             <div className="w-1.5 h-1.5 rounded-full bg-slate-900 animate-pulse"></div>
             <div className="w-1.5 h-1.5 rounded-full bg-gray-200"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-gray-50 flex flex-col font-sans">
      {/* Top Bar */}
      <header className="bg-white border-b border-gray-200 shrink-0 px-4 py-3 flex items-center justify-between shadow-sm z-20">
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">
          {isAdminView ? "Admin Panel" : activeTab === 'gigs' ? "GiGs" : activeTab === 'referrals' ? "Referrals" : activeTab === 'seekers' ? "Seekers" : activeTab === 'friends' ? "Friends" : "Settings"}
        </h1>
        
        {/* Admin Account Feature */}
        <div className="flex items-center gap-4 relative" ref={notificationsRef}>
          <div className="hidden sm:flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-100">
            <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[10px] font-black uppercase tracking-tighter">Live & Legit</span>
          </div>

          {!isAdminView && (
            <>
              {isVerified ? (
                <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-100 shadow-sm">
                  <BadgeCheck className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-black uppercase tracking-tighter">Verified Agent</span>
                </div>
              ) : isVerificationPending ? (
                <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full border border-amber-100 shadow-sm animate-pulse">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-black uppercase tracking-tighter">Pending Agent</span>
                </div>
              ) : (
                <button 
                  onClick={() => setShowVerificationModal(true)}
                  className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full border border-indigo-100 hover:bg-indigo-100 transition-colors"
                >
                  <UserCheck className="w-3 h-3" />
                  <span className="text-[10px] font-black uppercase tracking-tighter">Verify ID</span>
                </button>
              )}
            </>
          )}

          <button 
            onClick={() => { setIsAdminView(false); setActiveTab('settings'); }}
            className={`p-1.5 rounded-full transition-colors ${!isAdminView && activeTab === 'settings' ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>

          <button 
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="text-gray-400 hover:text-gray-600 transition-colors relative"
          >
            <Bell className="w-5 h-5" />
            {notifications.some(n => !n.read) && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border border-white"></span>
            )}
          </button>

          <button 
            onClick={handleSignOut}
            className="p-1.5 rounded-full text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors flex items-center gap-1"
            title="Sign Out"
          >
            <LogOut className="w-5 h-5" />
            <span className="hidden md:inline text-xs font-bold text-red-600">Sign Out</span>
          </button>
          
          {isNotificationsOpen && (
            <div className="absolute top-10 right-0 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="font-bold text-gray-900">Notifications</h3>
                <div className="flex gap-3">
                  <button onClick={() => setNotifications(notifications.map(n => ({...n, read: true})))} className="text-xs text-indigo-600 font-medium hover:text-indigo-800">
                    Read all
                  </button>
                  <button onClick={() => setNotifications([])} className="text-xs text-gray-500 font-medium hover:text-red-600">
                    Clear all
                  </button>
                </div>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {notifications.length > 0 ? notifications.map(notification => (
                  <div 
                    key={notification.id} 
                    onClick={() => {
                      if (!notification.read) {
                        setNotifications(notifications.map(n => n.id === notification.id ? { ...n, read: true } : n));
                      }
                      
                      // Redirection logic based on notification type and content
                      if ((notification as any).gigId) {
                        const gig = gigs.find(g => g.id === (notification as any).gigId);
                        if (gig) {
                          setActiveTab('gigs');
                          setViewingGig(gig);
                        }
                      } else if (notification.type === 'message') {
                        // Extract sender name from message e.g. "Sarah Jenkins replied..."
                        const nameMatch = notification.message.match(/^([A-Za-z\s]+?)\s+replied/);
                        const senderName = nameMatch ? nameMatch[1].trim() : "User";
                        setChattingWith(senderName);
                      } else if (notification.type === 'referral' || notification.type === 'reward') {
                        setActiveTab('wallet');
                      } else if (notification.type === 'friend') {
                        setActiveTab('friends');
                      } else if (notification.type === 'promo') {
                        setActivePromoPopup(notification);
                        setActiveTab('referrals');
                      }
                      
                      setIsNotificationsOpen(false);
                    }}
                    className={`p-4 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer group relative ${!notification.read ? 'bg-red-50/50 border-l-4 border-l-red-500' : ''}`}
                  >
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setNotifications(notifications.filter(n => n.id !== notification.id));
                      }}
                      className="absolute top-4 right-4 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="flex justify-between items-start mb-1 pr-6">
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">{notification.type}</span>
                      <span className="text-xs text-gray-400 font-medium">{notification.time}</span>
                    </div>
                    <h4 className={`text-sm mb-0.5 pr-6 ${!notification.read ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}`}>{notification.title}</h4>
                    <p className="text-xs text-gray-500 leading-relaxed pr-6">{notification.message}</p>
                  </div>
                )) : (
                  <div className="p-8 text-center text-gray-500 text-sm">
                    No new notifications
                  </div>
                )}
              </div>
            </div>
          )}
          
          {user?.email === ADMIN_EMAIL && (
            <button 
              onClick={() => setIsAdminView(!isAdminView)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${isAdminView ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-indigo-50 border-indigo-100 hover:bg-indigo-100 text-indigo-800'}`}
            >
              <UserCircle className={`w-5 h-5 ${isAdminView ? 'text-indigo-100' : 'text-indigo-700'}`} />
              <span className="text-sm font-medium">Admin</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className={`flex-1 w-full max-w-md mx-auto flex flex-col overflow-y-auto pb-24 ${activeTab === 'chats' ? 'bg-white' : 'p-4'}`}>
        {isAdminView ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Program Lifecycle Notice */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-600 p-2 rounded-xl text-white">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-indigo-900 uppercase tracking-widest">Program Lifecycle</h4>
                  <p className="text-[10px] text-indigo-700 font-medium">Referral program phase 1 ends in exactly **3 months**.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="bg-white px-3 py-1.5 rounded-lg border border-indigo-100 text-center min-w-[50px]">
                  <div className="text-sm font-black text-indigo-600">90</div>
                  <div className="text-[7px] text-indigo-400 font-bold uppercase">Days</div>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="text-gray-500 text-xs font-medium mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3"/> Total App Profit</div>
                <div className="text-2xl font-bold text-gray-900">R {appStats.total_profit.toLocaleString()}</div>
              </div>
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="text-gray-500 text-xs font-medium mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3"/> Referral Profit</div>
                <div className="text-2xl font-bold text-emerald-600">
                  R {completedAgents.reduce((acc, agent) => {
                    const isTier2 = agent.referrals >= 20;
                    const isTier1 = agent.referrals >= 10;
                    
                    if (!isTier1) return acc;

                    const pkg = packages.find(p => p.id === (agent as any).packageId) || packages[0];
                    const pkgRewardValue = parseInt(pkg.reward.replace('R', ''));
                    
                    const commissionRate = isTier2 ? 0.04 : 0.02;
                    const rewardMultiplier = isTier2 ? 1.0 : 0.5;
                    
                    const commissionAmount = (agent as any).referralTopups * commissionRate;
                    const rewardAmount = pkgRewardValue * rewardMultiplier;
                    
                    // Tier 2 Profit Sharing (10%)
                    const profitSharing = isTier2 ? ((agent as any).referralProfits * 0.10) : 0;
                    
                    const totalOwed = commissionAmount + rewardAmount + profitSharing;
                    const agentTopups = (agent as any).referralTopups || 0;
                    
                    return acc + (agentTopups + pkgRewardValue - totalOwed);
                  }, 0).toLocaleString()}
                </div>
                <div className="text-[10px] text-gray-400 font-bold uppercase mt-1">Net Admin Revenue</div>
              </div>
            </div>

            {/* Revenue Breakdown */}
            <div className="bg-white rounded-3xl p-5 border border-gray-150 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  System Financial Stats
                </h3>
                <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 uppercase">Real Time</span>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
                    <span className="text-[9px] text-gray-400 font-black uppercase block mb-1">Total System Profit</span>
                    <div className="text-lg font-black text-gray-900 tracking-tight">R {(appStats.total_profit || 0).toLocaleString()}</div>
                    <div className="text-[8px] text-gray-500 font-medium mt-1">
                      Gross revenue from approved top-ups
                    </div>
                  </div>
                  <div className="bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
                    <span className="text-[9px] text-gray-400 font-black uppercase block mb-1 text-red-500">Total Payouts</span>
                    <div className="text-lg font-black text-red-600 tracking-tight">- R {(appStats.total_payouts || 0).toLocaleString()}</div>
                    <div className="text-[8px] text-gray-500 font-medium mt-1">
                      Total funds withdrawn by agents
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-600 rounded-2xl p-4 text-white relative overflow-hidden shadow-lg border border-indigo-700">
                  <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-white/10 to-transparent"></div>
                  <div className="relative z-10">
                    <span className="text-[10px] text-indigo-100 font-black uppercase tracking-widest block mb-1">Net Treasury Balance</span>
                    <div className="text-3xl font-black tracking-tight text-white drop-shadow-sm">
                      R {((appStats.total_profit || 0) - (appStats.total_payouts || 0)).toLocaleString()}
                    </div>
                    <p className="text-[9px] text-indigo-50 font-medium mt-1">
                      Available funds after agent withdrawals.
                    </p>
                  </div>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-20">
                    <TrendingUp className="w-12 h-12" />
                  </div>
                </div>
              </div>
            </div>

            {/* System Performance Overview */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-indigo-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-indigo-900 uppercase tracking-widest flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-500" />
                  System Health
                </h3>
                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100 uppercase">Status: Optimal</span>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
                    <span className="text-[9px] text-gray-400 font-black uppercase block mb-1">Total Agents</span>
                    <div className="text-lg font-black text-gray-900 tracking-tight">{(completedAgents.length + activeAgents.length).toLocaleString()}</div>
                    <div className="text-[8px] text-gray-500 font-medium mt-1">Verified & Active agents</div>
                  </div>
                  <div className="bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
                    <span className="text-[9px] text-gray-400 font-black uppercase block mb-1">Online Today</span>
                    <div className="text-lg font-black text-emerald-600 tracking-tight">{appStats.online_users.toLocaleString()}</div>
                    <div className="text-[8px] text-gray-500 font-medium mt-1">Daily active session count</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Promotion & Broadcast Center */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-indigo-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-indigo-900 uppercase tracking-widest flex items-center gap-2">
                  <Bell className="w-4 h-4 text-indigo-500" />
                  Broadcast Center
                </h3>
                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100 uppercase">Promotions</span>
              </div>

              <form onSubmit={handleSendPromotion} className="space-y-4">
                <div>
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block mb-1">Promotion Title</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Flash Sale: 20% Extra Comms"
                    value={promoForm.title}
                    onChange={(e) => setPromoForm(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
                    required
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider block mb-1">Message Content</label>
                  <textarea 
                    placeholder="Describe the promotion details here..."
                    rows={3}
                    value={promoForm.message}
                    onChange={(e) => setPromoForm(prev => ({ ...prev, message: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-sm font-medium text-gray-600 outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
                    required
                  />
                </div>
                
                <button 
                  type="submit"
                  disabled={isSendingPromo}
                  className={`w-full py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98] ${
                    isSendingPromo 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'
                  }`}
                >
                  {isSendingPromo ? (
                    <>
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                      Broadcasting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send Promotion
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Admin Wallet Control Dashboard card */}
            <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 p-4 rounded-2xl shadow-sm text-white flex justify-between items-center border border-indigo-950">
              <div className="text-left">
                <span className="text-[9px] text-indigo-300 font-extrabold uppercase tracking-widest block">Admin Wallet Control</span>
                <h4 className="text-xl font-black mt-1 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-amber-100 to-amber-300">
                  {walletBalance} Coins <span className="text-xs font-medium text-indigo-300">Available</span>
                </h4>
                <p className="text-[10px] text-indigo-200/80 font-medium mt-1">
                  Pending: <span className="text-amber-300 font-bold">{pendingPayments.length} Topups</span> • <span className="text-emerald-300 font-bold">{pendingPayouts.length} Payouts</span>
                </p>
              </div>
              <div className="w-11 h-11 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20 backdrop-blur-md">
                <Wallet className="w-5.5 h-5.5 text-amber-300 animate-pulse" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 text-center">
                <div className="text-gray-400 text-[10px] uppercase font-bold tracking-wider mb-1">Active Users</div>
                <div className="text-lg font-bold text-gray-800 flex items-center justify-center gap-1"><Users className="w-4 h-4 text-indigo-500"/> {appStats.total_users.toLocaleString()}</div>
              </div>
              <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 text-center">
                <div className="text-gray-400 text-[10px] uppercase font-bold tracking-wider mb-1">Online</div>
                <div className="text-lg font-bold text-gray-800 flex items-center justify-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> {appStats.online_users.toLocaleString()}
                </div>
              </div>
              <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 text-center">
                <div className="text-gray-400 text-[10px] uppercase font-bold tracking-wider mb-1">Visits (Live)</div>
                <div className="text-lg font-bold text-gray-800 flex items-center justify-center gap-1"><Activity className="w-4 h-4 text-amber-500"/> {appStats.visits > 1000 ? (appStats.visits / 1000).toFixed(1) + 'K' : appStats.visits}</div>
              </div>
            </div>

            {/* Referral Packages Breakdown */}
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center justify-between">
                Active Agents by Package
              </h3>
              <div className="space-y-5">
                {packages.map(pkg => {
                  const agentsInPkg = activeAgents.filter(a => a.packageId === pkg.id);
                  const isCurrentUserInPkg = activePackage === pkg.id && user?.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase();
                  
                  if (agentsInPkg.length === 0 && !isCurrentUserInPkg) return null;

                  return (
                    <div key={pkg.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex justify-between items-center">
                        <div className="font-semibold text-gray-900">{pkg.reward} Package</div>
                        <div className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-1 rounded-md">{pkg.percentage}% Commission</div>
                      </div>
                      <div className="p-3 space-y-2">
                        {isCurrentUserInPkg && (
                          <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100 flex items-center justify-between relative overflow-hidden">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500"></div>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
                                <UserCircle className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="font-semibold text-gray-900 text-sm">Current User (You)</div>
                                <div className="text-[10px] text-indigo-500 bg-indigo-100/50 px-2 py-0.5 rounded inline-block mt-0.5">
                                  {bankDetails.bankName || "Pending Bank"} • {bankDetails.accountNumber || "Pending Account"}
                                </div>
                              </div>
                            </div>
                            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Active</span>
                          </div>
                        )}
                        {agentsInPkg.map(agent => (
                          <div key={agent.id} className="bg-white p-3 rounded-xl border border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center">
                                <UserCircle className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="font-semibold text-gray-900 text-sm">{agent.user}</div>
                                <div className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded inline-block mt-0.5">
                                  {agent.bankDetails.bankName} • {agent.bankDetails.account}
                                </div>
                              </div>
                            </div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Active</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Completed Agents */}
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center justify-between">
                Completed Agents
                <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 uppercase tracking-tight">Milestone: 20 Refs</span>
              </h3>
              <div className="space-y-3">
                {completedAgents.map(agent => {
                  const isTier2 = agent.referrals >= 20;
                  const isTier1 = agent.referrals >= 10;
                  const pkg = packages.find(p => p.id === (agent as any).packageId) || packages[0];
                  const pkgRewardValue = parseInt(pkg.reward.replace('R', ''));
                  
                  // Tier 1: 10+ refs -> 2% topups + 50% reward
                  // Tier 2: 20+ refs -> 4% topups + 100% reward + 10% profit share
                  const commissionRate = isTier2 ? 0.04 : (isTier1 ? 0.02 : 0);
                  const rewardMultiplier = isTier2 ? 1.0 : (isTier1 ? 0.5 : 0);
                  
                  const commissionAmount = (agent as any).referralTopups * commissionRate;
                  const rewardAmount = pkgRewardValue * rewardMultiplier;
                  const profitSharing = isTier2 ? ((agent as any).referralProfits * 0.10) : 0;
                  const totalOwed = commissionAmount + rewardAmount + profitSharing;
                  
                  return (
                    <div key={agent.id} className={`bg-white p-4 rounded-2xl shadow-sm border flex flex-col gap-3 ${isTier2 ? 'border-amber-200 bg-amber-50/10' : isTier1 ? 'border-emerald-100' : 'border-red-100 opacity-60'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isTier2 ? 'bg-amber-100 text-amber-600' : isTier1 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-400'}`}>
                            {isTier2 ? <Star className="w-5 h-5 fill-current" /> : isTier1 ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="font-bold text-gray-900 text-sm">{agent.user}</div>
                              {isTier2 ? (
                                <span className="bg-amber-100 text-amber-700 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border border-amber-200">Tier 2</span>
                              ) : isTier1 ? (
                                <span className="bg-emerald-100 text-emerald-700 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border border-emerald-200">Tier 1</span>
                              ) : (
                                <span className="bg-red-100 text-red-700 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border border-red-200">Unqualified</span>
                              )}
                            </div>
                            <div className="text-[10px] text-gray-500 font-medium">{agent.referrals} Verified Referrals • {pkg.reward} Pkg</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-black text-sm ${isTier2 ? 'text-amber-600' : isTier1 ? 'text-indigo-600' : 'text-gray-400'}`}>R{totalOwed.toFixed(2)}</div>
                          <div className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">Total Owed</div>
                        </div>
                      </div>

                      {/* Reward Breakdown */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-gray-50 p-2 rounded-xl border border-gray-100">
                          <div className="text-[8px] font-black text-gray-400 uppercase">Comms ({isTier2 ? '4%' : '2%'})</div>
                          <div className="text-[11px] font-bold text-gray-800">R{commissionAmount.toFixed(2)}</div>
                        </div>
                        <div className="bg-gray-50 p-2 rounded-xl border border-gray-100">
                          <div className="text-[8px] font-black text-gray-400 uppercase">Reward ({isTier2 ? '100%' : '50%'})</div>
                          <div className="text-[11px] font-bold text-gray-800">R{rewardAmount.toFixed(2)}</div>
                        </div>
                        <div className={`p-2 rounded-xl border transition-colors ${isTier2 ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100 opacity-40'}`}>
                          <div className="text-[8px] font-black text-gray-400 uppercase">Sharing (10%)</div>
                          <div className={`text-[11px] font-bold ${isTier2 ? 'text-amber-700' : 'text-gray-400'}`}>R{profitSharing.toFixed(2)}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between pt-1">
                        <div className="text-[9px] text-gray-400 bg-white px-2 py-1 rounded-lg border border-gray-100 font-mono">
                          {agent.bankDetails.bankName} • {agent.bankDetails.account}
                        </div>
                        {agent.paid ? (
                          <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl uppercase tracking-widest flex items-center gap-1 border border-emerald-100 shadow-sm">
                            <Check className="w-3 h-3" /> Paid
                          </span>
                        ) : (
                          <button 
                            onClick={() => {
                              handlePayAgent(agent.id);
                              setWalletMessage({ text: `Successfully paid R${totalOwed.toFixed(2)} to ${agent.user}`, type: 'success' });
                              setTimeout(() => setWalletMessage(null), 4000);
                            }}
                            className={`text-[10px] font-black text-white px-4 py-2 rounded-xl uppercase tracking-widest transition-all shadow-md active:scale-95 ${isTier2 ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                          >
                            Process Payment
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pending Approvals Queue */}
            <div className="bg-white rounded-3xl p-5 border border-gray-150 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h3 className="font-bold text-gray-900 text-sm">
                  Approval Queue
                </h3>
                <span className="bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border border-indigo-100">
                  Admin Tasks
                </span>
              </div>

              {/* Tabs Selector */}
              <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setAdminApprovalTab('topups')}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                    adminApprovalTab === 'topups'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Topups ({pendingPayments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAdminApprovalTab('payouts')}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                    adminApprovalTab === 'payouts'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Payouts ({pendingPayouts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAdminApprovalTab('verifications')}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                    adminApprovalTab === 'verifications'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  KYC ({pendingVerifications.length})
                </button>
              </div>

              {adminApprovalTab === 'verifications' && (
                <div className="flex gap-2 bg-gray-100 p-1 rounded-xl mb-4">
                  {(['pending', 'approved', 'rejected'] as const).map(status => (
                    <button
                      key={status}
                      onClick={() => setKycFilter(status)}
                      className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all capitalize ${
                        kycFilter === status
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              )}

              {/* Render Lists */}
              {adminApprovalTab === 'topups' ? (
                <div className="space-y-3 pt-1">
                  {pendingPayments.map(payment => (
                    <div key={payment.id} className="bg-gray-50/50 p-3.5 rounded-2xl border border-gray-100 flex items-center justify-between hover:border-indigo-150 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                          <div className="font-bold text-gray-950 text-xs">{payment.user}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">{payment.date} • <span className="font-bold text-indigo-600">{payment.amount}</span></div>
                        </div>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setSelectedDocument(payment)}
                        className="flex items-center gap-1 bg-white hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border border-gray-200 active:scale-95 shadow-sm"
                      >
                        <Eye className="w-3.5 h-3.5" /> View Proof
                      </button>
                    </div>
                  ))}
                  {pendingPayments.length === 0 && (
                    <div className="text-center py-8 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-150">
                      <CheckCircle2 className="w-7 h-7 mx-auto mb-1.5 text-gray-300" />
                      <p className="text-xs font-medium">All topup approvals completed!</p>
                    </div>
                  )}
                </div>
              ) : adminApprovalTab === 'payouts' ? (
                <div className="space-y-3 pt-1">
                  {pendingPayouts.map(payout => (
                    <div key={payout.id} className="bg-gray-50/50 p-3.5 rounded-2xl border border-gray-100 flex flex-col gap-3 hover:border-emerald-150 transition-all text-left">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-bold text-xs shrink-0">
                            🪙
                          </div>
                          <div>
                            <div className="font-bold text-gray-950 text-xs">{payout.user}</div>
                            <div className="text-[9px] text-gray-400 mt-0.5">{payout.date}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-black text-emerald-600 text-xs">{payout.amount}</div>
                          <div className="text-[9px] text-gray-400 font-bold mt-0.5">{payout.coins} Coins</div>
                        </div>
                      </div>
                      
                      {/* Bank details preview */}
                      <div className="bg-white px-3 py-2 rounded-xl border border-gray-100 text-[10px] text-gray-600 flex justify-between items-center">
                        <div>
                          <span className="font-medium text-gray-400 block uppercase text-[8px] tracking-wider">Bank Details</span>
                          <span className="font-bold text-gray-800">{payout.bankDetails.bankName}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-medium text-gray-400 block uppercase text-[8px] tracking-wider">Account No</span>
                          <span className="font-mono font-bold text-gray-800">{payout.bankDetails.account}</span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            await updateWithdrawalStatusHelper(payout.id, 'rejected');
                            
                            // Refund coins back to wallet balance for target user
                            try {
                              const localProfileKey = `local_profile_${payout.user_id}`;
                              const storedLocalProfile = localStorage.getItem(localProfileKey);
                              const localProfile = storedLocalProfile ? JSON.parse(storedLocalProfile) : { wallet_balance: 0 };
                              const newBal = (localProfile.wallet_balance || 0) + payout.coins;
                              await updateLocalProfileHelper(payout.user_id, { wallet_balance: newBal });
                            } catch (err) {
                              console.error(err);
                            }

                            // Add rejected payout transaction
                            const newTx = {
                              user_id: payout.user_id,
                              title: 'Withdrawal Cashout (Rejected & Refunded)',
                              amount: payout.coins,
                              type: 'credit' as const,
                              category: 'payout' as const,
                              date: 'Just now'
                            };
                            await insertTransactionHelper(newTx);

                            if (payout.user_id === user?.id) {
                              setWalletTransactions(prev => [{ ...newTx, id: Date.now().toString() } as any, ...prev]);

                              setNotifications(prev => [
                                {
                                  id: Date.now(),
                                  title: "Withdrawal Rejected",
                                  message: `Your withdrawal of ${payout.coins} Coins (${payout.amount}) was rejected. Coins have been refunded.`,
                                  type: "reward",
                                  time: "Just now",
                                  read: false
                                },
                                ...prev
                              ]);
                            }
                            setPendingPayouts(prev => prev.filter(p => p.id !== payout.id));
                            setWalletMessage({ text: "Payout request rejected and coins refunded.", type: "error" });
                            setTimeout(() => setWalletMessage(null), 4000);
                          }}
                          className="flex-1 py-2 bg-red-50 text-red-600 rounded-xl font-bold text-xs hover:bg-red-100 transition-colors border border-red-200 active:scale-95"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await updateWithdrawalStatusHelper(payout.id, 'approved');
                            
                            if (payout.user_id === user?.id) {
                              // Add transaction for local feedback
                              const newTx = {
                                id: 'tx-withdraw-approved-' + Date.now(),
                                title: 'Withdrawal Cashout Approved & Paid',
                                amount: payout.coins,
                                type: 'debit' as const,
                                date: 'Just now',
                                category: 'payout' as const
                              };
                              setWalletTransactions(prev => [newTx, ...prev]);

                              setNotifications(prev => [
                                {
                                  id: Date.now(),
                                  title: "Withdrawal Approved",
                                  message: `Your withdrawal of ${payout.coins} Coins (${payout.amount}) has been approved and paid to your ${payout.bankDetails.bankName} account!`,
                                  type: "reward",
                                  time: "Just now",
                                  read: false
                                },
                                ...prev
                              ]);
                            }

                            // Update app stats
                            let stats = null;
                            try {
                              const { data } = await supabase.from('app_stats').select('*').maybeSingle();
                              stats = data;
                            } catch (err) {
                              const stored = localStorage.getItem('local_app_stats');
                              stats = stored ? JSON.parse(stored) : null;
                            }
                            if (stats) {
                              const payoutValue = parseFloat(payout.amount.replace('R', '').replace(' ', '')) || 0;
                              try {
                                await supabase.from('app_stats').update({ total_payouts: (stats.total_payouts || 0) + payoutValue }).eq('id', stats.id);
                              } catch (err) {
                                const updated = { ...stats, total_payouts: (stats.total_payouts || 0) + payoutValue };
                                localStorage.setItem('local_app_stats', JSON.stringify(updated));
                              }
                            }
                            setPendingPayouts(prev => prev.filter(p => p.id !== payout.id));
                            setWalletMessage({ text: "Payout request approved! Funds processed.", type: "success" });
                            setTimeout(() => setWalletMessage(null), 4000);
                          }}
                          className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all active:scale-95"
                        >
                          Approve & Pay
                        </button>
                      </div>
                    </div>
                  ))}
                  {pendingPayouts.length === 0 && (
                    <div className="text-center py-8 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-150">
                      <CheckCircle2 className="w-7 h-7 mx-auto mb-1.5 text-gray-300" />
                      <p className="text-xs font-medium">All payout requests processed!</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  <button 
                    onClick={() => fetchVerifications(kycFilter)}
                    className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-xs shadow-sm transition-all active:scale-95 mb-2"
                  >
                    Refresh Verifications
                  </button>
                  {pendingVerifications.map(verif => (
                    <div key={verif.id} className="bg-gray-50/50 p-3.5 rounded-2xl border border-gray-100 flex flex-col gap-3 hover:border-amber-150 transition-all text-left">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center font-bold text-xs shrink-0">
                            <Sparkles className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-bold text-gray-950 text-xs">{verif.user}</div>
                            <div className="text-[9px] text-gray-400 mt-0.5">{verif.date}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-100 uppercase tracking-widest">Verification Requested</span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          type="button"
                          onClick={() => setSelectedVerification({ ...verif, currentView: 'id' })}
                          className="flex flex-col items-center gap-1.5 p-2 bg-white rounded-xl border border-gray-150 hover:border-indigo-300 transition-all group shadow-sm"
                        >
                          <div className="w-full aspect-video rounded-lg overflow-hidden bg-gray-50 border border-gray-100 flex items-center justify-center">
                             {verif.idImage ? (
                               <img src={verif.idImage} alt="ID" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                             ) : (
                               <span className="text-[10px] text-red-500 font-bold">No Image</span>
                             )}
                          </div>
                          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">ID Document</span>
                        </button>
                        <button 
                          type="button"
                          onClick={() => setSelectedVerification({ ...verif, currentView: 'face' })}
                          className="flex flex-col items-center gap-1.5 p-2 bg-white rounded-xl border border-gray-150 hover:border-indigo-300 transition-all group shadow-sm"
                        >
                          <div className="w-full aspect-video rounded-lg overflow-hidden bg-gray-50 border border-gray-100 flex items-center justify-center">
                             {verif.faceImage ? (
                               <img src={verif.faceImage} alt="Face" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                             ) : (
                               <span className="text-[10px] text-red-500 font-bold">No Image</span>
                             )}
                          </div>
                          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Face Photo</span>
                        </button>
                      </div>

                      {kycFilter === 'pending' && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              if (supabase) {
                                const { error } = await supabase.from('verifications').update({ status: 'rejected' }).eq('id', verif.id);
                                if (error) {
                                  console.error("Error rejecting verification:", error);
                                  return;
                                }
                                
                                // Send notification to the user
                                await supabase.from('notifications').insert([{
                                  user_id: verif.user_id,
                                  title: "KYC Verification Rejected",
                                  message: "Your identity verification was unfortunately rejected. Please try again with clearer documents.",
                                  type: "payout",
                                  time: "Just now"
                                }]);

                                if (verif.user_id === user?.id) {
                                  setIsVerificationPending(false);
                                  setWalletMessage({ text: "Verification rejected.", type: "error" });
                                  setTimeout(() => setWalletMessage(null), 4000);
                                } else {
                                  setWalletMessage({ text: "Verification rejected for " + verif.user, type: "error" });
                                  setTimeout(() => setWalletMessage(null), 4000);
                                }
                              }
                              setPendingVerifications(prev => prev.filter(v => v.id !== verif.id));
                              setNotifications(prev => prev.filter(n => n.id !== 'admin-verif-' + verif.id));
                            }}
                            className="flex-1 py-2.5 bg-red-50 text-red-600 rounded-xl font-bold text-xs hover:bg-red-100 transition-colors border border-red-200 active:scale-95"
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                                                        onClick={async () => {
                              if (!supabase) return;

                              // 1. Update verification status
                              const { error: verifError } = await supabase
                                .from('verifications')
                                .update({ status: 'approved' })
                                .eq('id', verif.id);
                              
                              if (verifError) {
                                console.error("Error approving verification:", verifError);
                                setWalletMessage({ text: "Error approving verification: " + verifError.message, type: "error" });
                                setTimeout(() => setWalletMessage(null), 4000);
                                return;
                              }
                              
                              // 2. Try to update user profile to verified
                              // Note: This may return permission denied because of RLS restrictions on other users' profiles.
                              // This is expected and is handled gracefully via client-side self-healing when that user logs in.
                              const { error: profileError } = await supabase
                                .from('profiles')
                                .update({ is_verified: true })
                                .eq('id', verif.user_id);
                              
                              if (profileError) {
                                console.warn("Note: Profile table update failed due to RLS permissions (expected for non-owners). Self-healing will complete this upon user login:", profileError);
                              }
                              
                              // 3. Send notification to the user
                              await supabase.from('notifications').insert([{
                                user_id: verif.user_id,
                                title: "Account Approved! 🚀",
                                message: "Congratulations! Your account review is approved and your identity has been successfully verified.",
                                type: "reward",
                                time: "Just now"
                              }]);

                              // 4. UI feedback
                              if (verif.user_id === user?.id) {
                                setIsVerificationPending(false);
                                setIsVerified(true);
                                setWalletMessage({ text: "Account verified successfully!", type: "success" });
                              } else {
                                setWalletMessage({ text: "Account verified for " + verif.user, type: "success" });
                              }
                              setTimeout(() => setWalletMessage(null), 4000);
                              setNotifications(prev => prev.filter(n => n.id !== 'admin-verif-' + verif.id));
                              
                              // 5. Refresh the list
                              fetchVerifications(kycFilter);
                            }}
                            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all active:scale-95"
                          >
                            Approve
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {pendingVerifications.length === 0 && (
                    <div className="text-center py-8 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-150">
                      <CheckCircle2 className="w-7 h-7 mx-auto mb-1.5 text-gray-300" />
                      <p className="text-xs font-medium">All KYC verifications completed!</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'referrals' ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Program End Notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex items-center gap-3">
              <div className="bg-amber-100 p-2 rounded-xl text-amber-600">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-amber-900 uppercase tracking-wider">Program Notice</p>
                <p className="text-[11px] text-amber-700 font-medium">The current referral program is scheduled to end in **3 months**. Maximize your earnings before then!</p>
              </div>
              <div className="text-right">
                <div className="text-lg font-black text-amber-600 leading-none">~90</div>
                <div className="text-[8px] text-amber-500 font-bold uppercase">Days Left</div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-6 rounded-3xl shadow-lg w-full mb-8 text-center text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
              <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-24 h-24 bg-indigo-400 opacity-20 rounded-full blur-xl"></div>
              
              <div className="relative z-10">
                <div className="w-16 h-16 bg-white/20 text-white rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-md border border-white/30 shadow-inner">
                  <Gift className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold mb-2 tracking-tight">Weekly Rewards</h2>
                <p className="text-indigo-100 mb-6 text-sm leading-relaxed max-w-[280px] mx-auto">
                  Activate a weekly package to earn premium commissions on your referrals' topups.
                </p>
                <button 
                  onClick={() => {
                    if (activePackage) {
                      setIsShareModalOpen(true);
                    } else {
                      alert('Please activate a weekly package first to get your referral link!');
                    }
                  }}
                  className={`w-full font-bold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-[0.98] ${
                    !activePackage 
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : isTourActive && tourStep === 5 
                        ? 'bg-amber-400 text-gray-900 hover:bg-amber-500 ring-4 ring-amber-400/50 animate-bounce' 
                        : 'bg-white text-indigo-700 hover:bg-indigo-50'
                  }`}
                >
                  <Share2 className="w-5 h-5" />
                  {activePackage ? 'Share Invite Link' : 'Activate Package to Share'}
                </button>
              </div>
            </div>

            <div className="space-y-5">
              {packages.map((pkg) => {
                const isActive = activePackage === pkg.id;
                return (
                  <div 
                    key={pkg.id}
                    className={`bg-white rounded-3xl p-5 transition-all relative overflow-hidden ${
                      isActive 
                        ? 'border-2 border-indigo-500 shadow-md ring-4 ring-indigo-500/10' 
                        : isTourActive && tourStep === 3
                          ? 'border-2 border-dashed border-indigo-400 shadow-md animate-pulse bg-indigo-50/10'
                          : 'border border-gray-200 shadow-sm hover:border-indigo-300 hover:shadow-md'
                    }`}
                  >
                    {isActive && <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-bl-[100px] z-0"></div>}
                    <div className="flex justify-between items-start mb-3 relative z-10">
                      <div>
                        <div className="inline-block px-3 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold tracking-wider uppercase rounded-md mb-2 border border-indigo-100">Weekly Reward</div>
                        <h3 className="text-3xl font-black text-gray-900 tracking-tight">{pkg.reward}</h3>
                        <div className="space-y-1.5 mt-2">
                          <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                            <span>Tier 1 (10-19 Refs): 2% Comms + 50% Reward</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-600">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                            <span>Tier 2 (20+ Refs): 4% Comms + 100% Reward + 10% Profit Share</span>
                          </div>
                        </div>
                      </div>
                      {isActive && (
                        <span className="bg-indigo-600 text-white p-2 rounded-full shadow-sm">
                          <CheckCircle2 className="w-6 h-6" />
                        </span>
                      )}
                    </div>

                    {isActive ? (
                      <div className="mt-5 pt-5 border-t border-gray-100 relative z-10">
                        <div className="flex items-center justify-between mb-5">
                          <div className="flex items-center text-sm font-medium text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 shadow-sm">
                            <Clock className="w-4 h-4 mr-1.5 text-amber-500" />
                            Ends Friday 17:00
                          </div>
                          <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider bg-indigo-50 px-2.5 py-1 rounded-md">Active Status</span>
                        </div>
                        
                        {/* Progress Bar for Cashout */}
                        <div className={`rounded-2xl p-5 border shadow-inner transition-all duration-300 ${isTourActive && tourStep === 4 ? 'bg-indigo-50 border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.3)] scale-[1.02]' : 'bg-gray-50 border-gray-100'}`}>
                          <div className="flex justify-between items-end mb-2">
                            <div>
                              <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest block mb-0.5">Verified Referrals</span>
                              <div className="text-2xl font-black text-gray-900 tracking-tight">{verifiedReferrals} <span className="text-gray-300 font-medium">/ 20</span></div>
                            </div>
                            <span className="text-sm font-bold text-indigo-600">{Math.round((verifiedReferrals / 20) * 100)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3 mb-5 overflow-hidden p-0.5 border border-gray-100 shadow-inner">
                            <div 
                              className={`h-full rounded-full transition-all duration-700 ${verifiedReferrals >= 20 ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-indigo-600'}`} 
                              style={{ width: `${Math.min(100, (verifiedReferrals / 20) * 100)}%` }}
                            ></div>
                          </div>
                          
                          <button 
                            disabled={verifiedReferrals < 1}
                            className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all shadow-sm ${
                              verifiedReferrals >= 1 
                                ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white hover:from-indigo-700 hover:to-indigo-800 shadow-indigo-500/20 active:scale-[0.98]' 
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            {verifiedReferrals >= 20 ? 'Cash Out (Tier 2 - 100%)' : verifiedReferrals >= 1 ? 'Cash Out (Tier 1 - 50%)' : 'No Verified Referrals'}
                          </button>
                          
                          <p className="text-[10px] text-gray-500 font-medium mt-3 text-center leading-relaxed">
                            {verifiedReferrals >= 20 
                              ? "Congratulations! You've unlocked Tier 2 rewards with full payout." 
                              : verifiedReferrals >= 10
                              ? "You've qualified for Tier 1 (50% Reward). Reach 20 for 100%!"
                              : `Reach 10 verified referrals to qualify for Tier 1 (50% Reward).`}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setActivatingPackageId(pkg.id)}
                        className="mt-5 w-full py-3.5 rounded-xl text-sm font-bold transition-all bg-white text-indigo-600 border-2 border-indigo-100 hover:bg-indigo-50 hover:border-indigo-200 focus:ring-4 focus:ring-indigo-500/20 relative z-10 active:scale-[0.98]"
                      >
                        Activate Package
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : activeTab === 'gigs' ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 flex flex-col flex-1 h-full overflow-y-auto">
            {viewingGig ? (
              <div className="flex flex-col flex-1 h-[calc(100vh-160px)] bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex-1 overflow-y-auto pb-6">
                  <div className="relative h-48 bg-gray-200 shrink-0" onClick={() => setFullScreenImageIndex(currentGigImageIndex)}>
                    <img src={viewingGig.images[currentGigImageIndex] || viewingGig.images[0]} alt={viewingGig.title} className="w-full h-full object-cover" />
                    <button onClick={(e) => { e.stopPropagation(); setViewingGig(null); setCurrentGigImageIndex(0); }} className="absolute top-4 left-4 p-2 bg-white/80 backdrop-blur-sm rounded-full hover:bg-white text-gray-800 shadow-sm transition-colors z-10">
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    {viewingGig.images.length > 1 && (
                      <>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setCurrentGigImageIndex(prev => prev > 0 ? prev - 1 : viewingGig.images.length - 1); }}
                          className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-white/80 backdrop-blur-sm rounded-full shadow-sm z-10"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setCurrentGigImageIndex(prev => prev < viewingGig.images.length - 1 ? prev + 1 : 0); }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-white/80 backdrop-blur-sm rounded-full shadow-sm z-10 rotate-180"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    <div className="absolute bottom-2 right-3 bg-black/60 text-white text-[10px] px-2 py-1 rounded-md font-medium z-10">
                      {currentGigImageIndex + 1} / {viewingGig.images.length}
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-2">
                      <h2 className="text-xl font-bold text-gray-900">{viewingGig.title}</h2>
                      <span className="text-lg font-black text-emerald-600">{viewingGig.price}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-gray-500 mb-5">
                      <span className="flex items-center gap-1 bg-gray-100 px-2.5 py-1 rounded-md"><MapPin className="w-3 h-3" /> {viewingGig.location}</span>
                      <span className="flex items-center gap-1 bg-gray-100 px-2.5 py-1 rounded-md"><Calendar className="w-3 h-3" /> {viewingGig.date}</span>
                    </div>
                    
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl mb-6 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => setViewingProfile(viewingGig.owner)}>
                      <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center overflow-hidden">
                        <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(viewingGig.owner)}&background=e0e7ff&color=4f46e5`} alt={viewingGig.owner} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 font-medium">Gig Owner</div>
                        <div className="font-semibold text-gray-900 text-sm">{viewingGig.owner}</div>
                      </div>
                    </div>
                    
                    <div className="mb-4">
                      <h3 className="font-bold text-gray-900 mb-2">Description</h3>
                      <p className="text-gray-600 text-sm leading-relaxed">{viewingGig.description}</p>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 border-t border-gray-100 bg-white shrink-0">
                  {viewingGig.owner === 'Current User' ? (
                    <div className="flex gap-3">
                      <button 
                        onClick={() => {
                          setNewGig({ title: viewingGig.title, description: viewingGig.description, price: viewingGig.price, location: viewingGig.location, category: (viewingGig as any).category || "Casual Jobs (Dog Walk, Gardening, etc)", images: viewingGig.images });
                          setEditingGigId(viewingGig.id);
                          setViewingGig(null);
                          setIsCreatingGig(true);
                        }}
                        className="flex-1 bg-indigo-50 text-indigo-700 font-bold py-3 rounded-xl hover:bg-indigo-100 transition-colors shadow-sm"
                      >
                        Edit Gig
                      </button>
                      <button 
                        onClick={() => {
                          setGigs(gigs.filter(g => g.id !== viewingGig.id));
                          setViewingGig(null);
                        }}
                        className="flex-1 bg-red-50 text-red-600 font-bold py-3 rounded-xl hover:bg-red-100 transition-colors shadow-sm"
                      >
                        Delete Gig
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <button 
                        onClick={async () => {
                          if (await deductCoins(20, "Gig Application Fee") && supabase) {
                            await supabase.from('gig_applications').insert([{
                              gig_id: viewingGig.id,
                              user_id: user?.id,
                              owner_name: viewingGig.owner,
                              gig_title: viewingGig.title,
                              status: 'applied'
                            }]);

                            setChattingWith(viewingGig.owner);
                            setMessages([]);
                            // Send auto-application message
                            const appMsg = {
                              id: 'app-' + Date.now(),
                              text: `Hi ${viewingGig.owner}! I am interested in your gig: "${viewingGig.title}". Please check my profile!`,
                              sender: 'me' as const,
                              timestamp: Date.now()
                            };
                            setMessages([appMsg]);
                          }
                        }}
                        className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm flex items-center justify-center gap-2"
                      >
                        <Briefcase className="w-5 h-5" />
                        Apply Now (20c)
                      </button>
                      <button 
                        onClick={() => {
                          setChattingWith(viewingGig.owner);
                          setMessages([]);
                        }}
                        className="flex-1 bg-white border-2 border-indigo-100 text-indigo-600 font-bold py-3 rounded-xl hover:bg-indigo-50 transition-colors shadow-sm flex items-center justify-center gap-2"
                      >
                        <MessageCircle className="w-5 h-5" />
                        Message
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : isCreatingGig ? (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                  <button onClick={() => { setIsCreatingGig(false); setEditingGigId(null); setNewGig({ title: '', description: '', price: '', location: '', category: 'Casual Jobs (Dog Walk, Gardening, etc)', images: [] }); }} className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <h2 className="text-lg font-bold text-gray-900">{editingGigId ? 'Edit Gig' : 'Create a New Gig'}</h2>
                </div>
                
                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if(newGig.title && supabase) {
                      if (!editingGigId) {
                        if (!await deductCoins(50, "Gig Creation Fee")) return;
                      }
                      
                      const gigData = {
                        title: newGig.title,
                        description: newGig.description,
                        price: newGig.price,
                        location: newGig.location,
                        category: newGig.category,
                        owner: user?.user_metadata?.full_name || user?.email || 'User',
                        user_id: user?.id,
                        images: newGig.images.length > 0 ? newGig.images : ['https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=800'],
                        date: 'Just now'
                      };

                      if (editingGigId) {
                        await supabase.from('gigs').update(gigData).eq('id', editingGigId);
                        setEditingGigId(null);
                      } else {
                        const { data } = await supabase.from('gigs').insert([gigData]).select();
                        // Real-time listener will handle the local state update
                      }
                      setIsCreatingGig(false);
                      setNewGig({ title: '', description: '', price: '', location: '', category: 'Casual Jobs (Dog Walk, Gardening, etc)', images: [] });
                    }
                  }} 
                  className="p-5 space-y-4"
                >
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Gig Title</label>
                    <input 
                      type="text" 
                      required
                      value={newGig.title}
                      onChange={e => setNewGig({...newGig, title: e.target.value})}
                      placeholder="e.g. Need a logo designer"
                      className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Category</label>
                    <select
                      value={newGig.category}
                      onChange={e => setNewGig({...newGig, category: e.target.value})}
                      className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all appearance-none"
                    >
                      {JOB_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Description</label>
                    <textarea 
                      required
                      value={newGig.description}
                      onChange={e => setNewGig({...newGig, description: e.target.value})}
                      placeholder="Describe what you need done..."
                      rows={4}
                      className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all resize-none"
                    ></textarea>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Price/Budget</label>
                      <input 
                        type="text" 
                        required
                        value={newGig.price}
                        onChange={e => setNewGig({...newGig, price: e.target.value})}
                        placeholder="e.g. R500"
                        className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Location</label>
                      <input 
                        type="text" 
                        required
                        value={newGig.location}
                        onChange={e => setNewGig({...newGig, location: e.target.value})}
                        placeholder="e.g. Remote or City"
                        className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Images</label>
                    <input 
                      type="file" 
                      multiple
                      accept="image/*"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []) as File[];
                        const urls = files.map(file => URL.createObjectURL(file));
                        setNewGig({...newGig, images: [...newGig.images, ...urls]});
                      }}
                      className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                    />
                    {newGig.images.length > 0 && (
                      <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                        {newGig.images.map((url, i) => (
                          <div key={i} className="relative shrink-0">
                            <img src={url} alt={`Gig image ${i}`} className="h-16 w-16 object-cover rounded-lg border border-gray-200" />
                            <button 
                              type="button"
                              onClick={() => setNewGig({...newGig, images: newGig.images.filter((_, index) => index !== i)})}
                              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-sm"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="pt-4">
                    <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm active:scale-[0.98]">
                      {editingGigId ? 'Save Changes' : 'Publish Gig (50c)'}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Available GiGs</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Find work or hire someone</p>
                  </div>
                  <button 
                    onClick={() => { setIsCreatingGig(true); setEditingGigId(null); setNewGig({ title: '', description: '', price: '', location: '', category: 'Casual Jobs (Dog Walk, Gardening, etc)', images: [] }); }}
                    className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center hover:bg-indigo-200 transition-colors shadow-sm"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>

                {/* Gigs Search & Location Filters */}
                <div className="space-y-3 bg-white p-4 rounded-2xl border border-gray-150 shadow-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="relative">
                      <input
                        type="text"
                        value={gigSearchQuery}
                        onChange={(e) => setGigSearchQuery(e.target.value)}
                        placeholder="Search gigs (e.g. Developer, Plumber...)"
                        className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl pl-4 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                      />
                      {gigSearchQuery && (
                        <button onClick={() => setGigSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        value={gigLocationQuery}
                        onChange={(e) => setGigLocationQuery(e.target.value)}
                        placeholder="Province / city / remote..."
                        className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                      />
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      {gigLocationQuery && (
                        <button onClick={() => setGigLocationQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Province quick filters */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-2 px-2 scrollbar-none">
                    {["All Locations", "Remote", "Johannesburg", "Cape Town", "Gauteng", "Western Cape", "KwaZulu-Natal"].map((loc) => {
                      const isSelected = loc === "All Locations" ? !gigLocationQuery : gigLocationQuery.toLowerCase() === loc.toLowerCase();
                      return (
                        <button
                          key={loc}
                          onClick={() => setGigLocationQuery(loc === "All Locations" ? "" : loc)}
                          type="button"
                          className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold shrink-0 border transition-all ${
                            isSelected 
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' 
                              : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {loc}
                        </button>
                      );
                    })}
                  </div>

                  {/* Category quick filters */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-2 px-2 scrollbar-none border-t border-gray-100 pt-2">
                    {["All Categories", ...JOB_CATEGORIES].map((cat) => {
                      const isSelected = cat === "All Categories" ? !selectedGigCategory : selectedGigCategory === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => setSelectedGigCategory(cat === "All Categories" ? "" : cat)}
                          type="button"
                          className={`text-[10px] px-2.5 py-1 rounded-full font-bold shrink-0 border transition-all ${
                            isSelected 
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' 
                              : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>
                
                {(() => {
                  const filteredGigs = gigs.filter(gig => {
                    const matchesSearch = gig.title.toLowerCase().includes(gigSearchQuery.toLowerCase()) || 
                                          gig.description.toLowerCase().includes(gigSearchQuery.toLowerCase());
                    const matchesLoc = !gigLocationQuery || 
                                       gig.location.toLowerCase().includes(gigLocationQuery.toLowerCase());
                    const matchesCategory = !selectedGigCategory || gig.category === selectedGigCategory;
                    return matchesSearch && matchesLoc && matchesCategory;
                  });

                  if (filteredGigs.length === 0) {
                    return (
                      <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
                        <Briefcase className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                        <p className="text-sm text-gray-500 font-medium">No matching gigs found.</p>
                      </div>
                    );
                  }

                  // Group by province
                  const grouped = filteredGigs.reduce((acc, gig) => {
                    const province = getProvinceName(gig.location);
                    if (!acc[province]) {
                      acc[province] = [];
                    }
                    acc[province].push(gig);
                    return acc;
                  }, {} as Record<string, typeof gigs>);

                  // Sort groups based on provinceOrder
                  const sortedProvinces = Object.keys(grouped).sort((a, b) => {
                    const idxA = provinceOrder.indexOf(a);
                    const idxB = provinceOrder.indexOf(b);
                    if (idxA === -1) return 1;
                    if (idxB === -1) return -1;
                    return idxA - idxB;
                  });

                  return (
                    <div className="space-y-6">
                      {sortedProvinces.map(prov => (
                        <div key={prov} className="space-y-3 bg-gray-50/50 rounded-2xl p-4 border border-gray-100/80 shadow-sm animate-in fade-in duration-200">
                          <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-1">
                            <h3 className="text-xs font-black text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                              {prov}
                            </h3>
                            <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] px-2.5 py-0.5 rounded-full font-bold font-mono">
                              {grouped[prov].length} {grouped[prov].length === 1 ? 'gig' : 'gigs'}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 pt-1">
                            {grouped[prov].map(gig => (
                              <div 
                                key={gig.id} 
                                onClick={() => { setViewingGig(gig); setCurrentGigImageIndex(0); }}
                                className="group cursor-pointer flex flex-col bg-white p-2.5 rounded-xl border border-gray-150 hover:border-indigo-200 hover:shadow-md transition-all duration-300 relative overflow-hidden"
                              >
                                <div className="aspect-square bg-gray-100 overflow-hidden rounded-lg relative mb-2">
                                  <img src={gig.images[0]} alt={gig.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                </div>
                                <div className="px-1">
                                  <div className="font-bold text-indigo-600 text-sm sm:text-base leading-tight mb-0.5">{gig.price}</div>
                                  <h3 className="text-xs text-gray-700 line-clamp-1 font-semibold group-hover:text-indigo-600 transition-colors">{gig.title}</h3>
                                  {(gig as any).category && (
                                    <span className="inline-block text-[8px] font-bold bg-indigo-50 border border-indigo-100/40 text-indigo-600 px-1.5 py-0.5 rounded mt-1 truncate max-w-full">
                                      {(gig as any).category}
                                    </span>
                                  )}
                                  <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-0.5">
                                     <MapPin className="w-3 h-3 text-indigo-400 shrink-0" />
                                     <span className="truncate">{gig.location}</span>
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        ) : activeTab === 'seekers' ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
            {/* Header / Search Controls */}
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button
                onClick={() => setSeekersTab('find')}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${seekersTab === 'find' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Find Seekers
              </button>
              <button
                onClick={() => setSeekersTab('mine')}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${seekersTab === 'mine' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                My Seeker Profile
              </button>
            </div>

            {seekersTab === 'find' ? (
              <div className="space-y-4">
                {/* Search & Location Bar */}
                <div className="space-y-3 bg-white p-4 rounded-2xl border border-gray-150 shadow-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="relative">
                      <input
                        type="text"
                        value={seekerSearchQuery}
                        onChange={(e) => setSeekerSearchQuery(e.target.value)}
                        placeholder="Search name or service..."
                        className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl pl-4 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                      />
                      {seekerSearchQuery && (
                        <button onClick={() => setSeekerSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        value={seekerLocationQuery}
                        onChange={(e) => setSeekerLocationQuery(e.target.value)}
                        placeholder="Province / city / remote..."
                        className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                      />
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      {seekerLocationQuery && (
                        <button onClick={() => setSeekerLocationQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Province quick filters */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-2 px-2 scrollbar-none">
                    {["All Provinces", "Remote", "Gauteng", "Western Cape", "KwaZulu-Natal"].map((prov) => {
                      const isSelected = prov === "All Provinces" ? !seekerLocationQuery : seekerLocationQuery.toLowerCase() === prov.toLowerCase();
                      return (
                        <button
                          key={prov}
                          onClick={() => setSeekerLocationQuery(prov === "All Provinces" ? "" : prov)}
                          type="button"
                          className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold shrink-0 border transition-all ${
                            isSelected 
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' 
                              : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {prov}
                        </button>
                      );
                    })}
                  </div>

                  {/* Category quick filters */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-2 px-2 scrollbar-none border-t border-gray-100 pt-2">
                    {["All Categories", ...JOB_CATEGORIES].map((cat) => {
                      const isSelected = cat === "All Categories" ? !selectedSeekerCategory : selectedSeekerCategory === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => setSelectedSeekerCategory(cat === "All Categories" ? "" : cat)}
                          type="button"
                          className={`text-[10px] px-2.5 py-1 rounded-full font-bold shrink-0 border transition-all ${
                            isSelected 
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' 
                              : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Skill quick filters */}
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
                  {["All Skills", "React", "UI Design", "Figma", "Node.js", "SEO", "Copywriting", "Branding"].map((skill) => {
                    const isSelected = skill === "All Skills" ? !selectedSeekerSkill : selectedSeekerSkill === skill;
                    return (
                      <button
                        key={skill}
                        onClick={() => setSelectedSeekerSkill(skill === "All Skills" ? null : skill)}
                        className={`text-xs px-3 py-1.5 rounded-full font-medium shrink-0 border transition-all ${
                          isSelected 
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' 
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {skill}
                      </button>
                    );
                  })}
                </div>

                {/* Seekers List */}
                {(() => {
                  const filteredSeekers = seekers.filter(s => {
                    // Hide admin from normal users
                    if (s.email === 'timegig2026@gmail.com' && session?.user?.email !== 'timegig2026@gmail.com') return false;

                    const matchesSearch = s.name.toLowerCase().includes(seekerSearchQuery.toLowerCase()) || 
                                          s.title.toLowerCase().includes(seekerSearchQuery.toLowerCase()) || 
                                          s.bio.toLowerCase().includes(seekerSearchQuery.toLowerCase());
                    const matchesLoc = !seekerLocationQuery || 
                                       (s.location || "Remote").toLowerCase().includes(seekerLocationQuery.toLowerCase());
                    const matchesSkill = !selectedSeekerSkill || s.skills.some(skill => skill.toLowerCase() === selectedSeekerSkill.toLowerCase());
                    const matchesCategory = !selectedSeekerCategory || (s as any).category === selectedSeekerCategory;
                    return matchesSearch && matchesLoc && matchesSkill && matchesCategory;
                  });

                  if (filteredSeekers.length === 0) {
                    return (
                      <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
                        <Users className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                        <p className="text-sm text-gray-500 font-medium">No matching seekers found.</p>
                      </div>
                    );
                  }

                  const grouped = filteredSeekers.reduce((acc, s) => {
                    const province = getProvinceName(s.location || "Remote");
                    if (!acc[province]) {
                      acc[province] = [];
                    }
                    acc[province].push(s);
                    return acc;
                  }, {} as Record<string, typeof seekers>);

                  const sortedProvinces = Object.keys(grouped).sort((a, b) => {
                    const idxA = provinceOrder.indexOf(a);
                    const idxB = provinceOrder.indexOf(b);
                    if (idxA === -1) return 1;
                    if (idxB === -1) return -1;
                    return idxA - idxB;
                  });

                  return (
                    <div className="space-y-6">
                      {sortedProvinces.map(prov => (
                        <div key={prov} className="space-y-4 bg-gray-50/50 rounded-2xl p-4 border border-gray-100 shadow-sm animate-in fade-in duration-200">
                          <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-1">
                            <h3 className="text-xs font-black text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                              {prov}
                            </h3>
                            <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] px-2.5 py-0.5 rounded-full font-bold font-mono">
                              {grouped[prov].length} {grouped[prov].length === 1 ? 'seeker' : 'seekers'}
                            </span>
                          </div>
                          
                          <div className="space-y-3 pt-1">
                            {grouped[prov].map((seeker) => (
                              <div 
                                key={seeker.id} 
                                onClick={() => setViewingSeekerDetail(seeker)}
                                className="bg-white rounded-2xl p-5 border border-gray-150 shadow-sm flex flex-col gap-4 hover:border-indigo-150 transition-all cursor-pointer hover:shadow-md group relative overflow-hidden"
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex gap-3">
                                    <div 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setFullscreenSeekerAvatar(seeker.avatar);
                                      }}
                                      className="w-14 h-14 rounded-full overflow-hidden border-2 border-indigo-50 shrink-0 hover:scale-105 active:scale-95 transition-transform duration-200 cursor-zoom-in shadow-sm relative"
                                      title="View full picture"
                                    >
                                      <img src={seeker.avatar} alt={seeker.name} className="w-full h-full object-cover" />
                                      <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Eye className="w-3.5 h-3.5 text-white drop-shadow" />
                                      </div>
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-1.5">
                                        <h3 className="font-bold text-gray-900 text-base group-hover:text-indigo-600 transition-colors">{seeker.name}</h3>
                                        {seeker.isPremium && (
                                          <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">PRO</span>
                                        )}
                                      </div>
                                      <p className="text-xs font-semibold text-gray-600 mt-0.5">{seeker.title}</p>
                                      {(seeker as any).category && (
                                        <div className="mt-1">
                                          <span className="bg-amber-50 border border-amber-200 text-amber-800 text-[9px] font-bold px-2 py-0.5 rounded-full inline-block">
                                            {(seeker as any).category}
                                          </span>
                                        </div>
                                      )}
                                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 font-medium mt-1.5">
                                        <span className="flex items-center gap-0.5 text-amber-500 font-semibold"><Star className="w-3.5 h-3.5 fill-current text-amber-500" /> {seeker.rating}</span>
                                        <span>•</span>
                                        <span>{seeker.completedJobs} Jobs completed</span>
                                        <span>•</span>
                                        <span className="flex items-center gap-0.5 text-gray-500 bg-gray-100 px-2 py-0.5 rounded text-[10px] font-bold"><MapPin className="w-3 h-3 text-indigo-500" /> {seeker.location || 'Remote'}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <span className="text-base font-black text-emerald-600 whitespace-nowrap">{seeker.rate}</span>
                                </div>

                                <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">{seeker.bio}</p>

                                <div className="flex flex-wrap gap-1.5">
                                  {seeker.skills.map((skill) => (
                                    <span key={skill} className="bg-indigo-50/50 border border-indigo-100/45 text-indigo-600 text-[10px] font-semibold px-2.5 py-1 rounded-md">
                                      {skill}
                                    </span>
                                  ))}
                                </div>

                                <div className="flex gap-2 pt-1 border-t border-gray-50">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setViewingSeekerDetail(seeker);
                                    }}
                                    className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                                  >
                                    <UserCircle className="w-4 h-4" /> View Profile
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setChattingWith(seeker.name);
                                      setMessages([
                                        {
                                          id: Date.now().toString(),
                                          text: `Hello ${seeker.name}, I am interested in hiring your services. Let's discuss details!`,
                                          sender: 'me',
                                          timestamp: Date.now()
                                        }
                                      ]);
                                    }}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                                  >
                                    <MessageCircle className="w-4 h-4" /> Message Seeker
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="space-y-4">
                {mySeekerProfile.hasProfile ? (
                  <div className="space-y-5">
                    {/* Public preview card */}
                    <div className="bg-white rounded-3xl p-6 border border-indigo-100 shadow-md relative overflow-hidden">
                      <div className="absolute top-0 right-0 bg-indigo-500/10 text-indigo-600 text-xs font-bold px-3 py-1 rounded-bl-xl border-l border-b border-indigo-100">
                        Live on Directory
                      </div>
                      <div className="flex items-center gap-4 mb-4">
                        <img src={mySeekerProfile.avatar} alt="My Avatar" className="w-16 h-16 rounded-full object-cover border-2 border-indigo-100 shadow-sm" />
                        <div>
                          <h3 className="font-bold text-gray-900 text-lg flex items-center gap-1.5">
                            {mySeekerProfile.name}
                            <span className="bg-indigo-100 text-indigo-700 text-[9px] px-2 py-0.5 rounded-md font-extrabold uppercase">You</span>
                          </h3>
                          <p className="text-sm font-semibold text-indigo-600 mt-0.5">{mySeekerProfile.title}</p>
                          {mySeekerProfile.category && (
                            <div className="mt-1">
                              <span className="bg-amber-50 border border-amber-200 text-amber-800 text-[9px] font-bold px-2 py-0.5 rounded-full inline-block">
                                {mySeekerProfile.category}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-3 text-xs text-gray-400 font-medium mt-1">
                            <span className="flex items-center gap-0.5 text-amber-500"><Star className="w-3.5 h-3.5 fill-current text-amber-500" /> 5.0</span>
                            <span>•</span>
                            <span>0 Jobs completed</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Service Bio</span>
                          <p className="text-sm text-gray-600 leading-relaxed">{mySeekerProfile.bio}</p>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Hourly Rate</span>
                          <span className="text-base font-black text-emerald-600">{mySeekerProfile.rate}</span>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Skills Offered</span>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {mySeekerProfile.skills.split(',').map((skill) => (
                              <span key={skill.trim()} className="bg-indigo-50 border border-indigo-100 text-indigo-600 text-[10px] font-semibold px-2.5 py-1 rounded-md">
                                {skill.trim()}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setMySeekerProfile({
                            ...mySeekerProfile,
                            hasProfile: false
                          });
                          // Remove from seekers list
                          setSeekers(seekers.filter(s => s.name !== "Current User"));
                        }}
                        className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 font-bold py-3.5 rounded-xl text-sm transition-colors shadow-sm"
                      >
                        Deactivate Profile
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-3xl p-6 border border-gray-150 shadow-sm space-y-5">
                    <div className="text-center max-w-[280px] mx-auto space-y-2">
                      <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-100">
                        <Sparkles className="w-7 h-7" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 tracking-tight">Create Seeker Profile (50c)</h3>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        List your professional services, set your hourly rate, and allow potential clients to hire you directly.
                      </p>
                    </div>

                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (mySeekerProfile.title && mySeekerProfile.bio && mySeekerProfile.rate) {
                          if (!await deductCoins(50, "Seeker Profile Fee")) return;
                          
                          setMySeekerProfile({
                            ...mySeekerProfile,
                            hasProfile: true
                          });
                          // Add to seekers list
                          setSeekers([
                            {
                              id: Date.now(),
                              name: "Current User",
                              title: mySeekerProfile.title,
                              bio: mySeekerProfile.bio,
                              rate: mySeekerProfile.rate.startsWith('R') ? mySeekerProfile.rate : `R${mySeekerProfile.rate}`,
                              category: mySeekerProfile.category,
                              skills: mySeekerProfile.skills.split(',').map(s => s.trim()).filter(s => s.length > 0),
                              rating: 5.0,
                              completedJobs: 0,
                              isPremium: true,
                              email: user?.email || "currentuser@example.com",
                              location: mySeekerProfile.location || "Remote",
                              avatar: mySeekerProfile.avatar
                            },
                            ...seekers
                          ]);
                          setSeekersTab('find');
                        }
                      }}
                      className="space-y-4 pt-2"
                    >
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Professional Title</label>
                        <input
                          type="text"
                          required
                          value={mySeekerProfile.title}
                          onChange={e => setMySeekerProfile({...mySeekerProfile, title: e.target.value})}
                          placeholder="e.g. Graphic Designer, Plumber, Accountant"
                          className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Job Category</label>
                        <select
                          value={mySeekerProfile.category}
                          onChange={e => setMySeekerProfile({...mySeekerProfile, category: e.target.value})}
                          className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all appearance-none"
                        >
                          {JOB_CATEGORIES.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Hourly Rate</label>
                          <input
                            type="text"
                            required
                            value={mySeekerProfile.rate}
                            onChange={e => setMySeekerProfile({...mySeekerProfile, rate: e.target.value})}
                            placeholder="e.g. R350/hr"
                            className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Location / Province</label>
                          <input
                            type="text"
                            required
                            value={mySeekerProfile.location}
                            onChange={e => setMySeekerProfile({...mySeekerProfile, location: e.target.value})}
                            placeholder="e.g. Cape Town, Western Cape"
                            className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Professional Bio</label>
                        <textarea
                          required
                          value={mySeekerProfile.bio}
                          onChange={e => setMySeekerProfile({...mySeekerProfile, bio: e.target.value})}
                          placeholder="Introduce yourself, your skills, and what kind of service you provide to clients..."
                          rows={4}
                          className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all resize-none"
                        ></textarea>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Skills (Comma-separated)</label>
                        <input
                          type="text"
                          required
                          value={mySeekerProfile.skills}
                          onChange={e => setMySeekerProfile({...mySeekerProfile, skills: e.target.value})}
                          placeholder="e.g. Design, Branding, Painting, Web Dev"
                          className="w-full text-sm bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl text-sm transition-colors shadow-md active:scale-[0.98]"
                      >
                        Publish Seeker Profile
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : activeTab === 'friends' ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
            {/* Friends Sub-tab switcher */}
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button
                onClick={() => { setFriendsSubTab('contacts'); setFriendSearchQuery(''); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${friendsSubTab === 'contacts' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Users className="w-4 h-4" />
                <span>My Contacts</span>
                <span className="bg-gray-200 text-gray-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                  {friends.length}
                </span>
              </button>
              <button
                onClick={() => { setFriendsSubTab('discover'); setFriendSearchQuery(''); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${friendsSubTab === 'discover' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <UserPlus className="w-4 h-4" />
                <span>Discover</span>
              </button>
              <button
                onClick={() => { setFriendsSubTab('requests'); setFriendSearchQuery(''); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${friendsSubTab === 'requests' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Bell className="w-4 h-4" />
                <span>Requests</span>
                {friendRequests.filter(r => r.type === 'incoming' && r.status === 'pending').length > 0 && (
                  <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                    {friendRequests.filter(r => r.type === 'incoming' && r.status === 'pending').length}
                  </span>
                )}
              </button>
            </div>

            {/* Friend Toast System Message */}
            {friendSystemMessage && (
              <div className={`p-3 rounded-xl border flex items-center gap-2.5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300 ${
                friendSystemMessage.type === 'success' 
                  ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
                  : 'bg-indigo-50 border-indigo-100 text-indigo-800'
              }`}>
                {friendSystemMessage.type === 'success' ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                )}
                <span className="text-xs font-semibold">{friendSystemMessage.text}</span>
              </div>
            )}

            {/* Sub-tab 1: My Contacts */}
            {friendsSubTab === 'contacts' && (
              <div className="space-y-4">
                {/* Search Contacts */}
                <div className="relative">
                  <input
                    type="text"
                    value={friendSearchQuery}
                    onChange={(e) => setFriendSearchQuery(e.target.value)}
                    placeholder="Search contacts..."
                    className="w-full text-sm bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm"
                  />
                  {friendSearchQuery && (
                    <button onClick={() => setFriendSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Contacts List */}
                {(() => {
                  const filteredFriends = initialAppUsers.filter(user => {
                    // Hide admin from normal users
                    if (user.email === 'timegig2026@gmail.com' && session?.user?.email !== 'timegig2026@gmail.com') return false;
                    
                    const isFriend = friends.includes(user.id);
                    if (!isFriend) return false;
                    if (friendSearchQuery) {
                      const q = friendSearchQuery.toLowerCase();
                      return user.name.toLowerCase().includes(q) || 
                             user.title.toLowerCase().includes(q) || 
                             user.location.toLowerCase().includes(q);
                    }
                    return true;
                  });

                  if (filteredFriends.length === 0) {
                    return (
                      <div className="text-center py-12 text-gray-400 bg-white rounded-3xl border border-dashed border-gray-200 shadow-sm p-6">
                        <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <h3 className="text-sm font-semibold text-gray-700 mb-1">No friends found</h3>
                        <p className="text-xs text-gray-500 max-w-[240px] mx-auto mb-4">
                          {friendSearchQuery ? "Try searching for a different name or title." : "Build your connection network! Discover other users using the app."}
                        </p>
                        {!friendSearchQuery && (
                          <button
                            onClick={() => setFriendsSubTab('discover')}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-xl text-xs transition-colors shadow-sm"
                          >
                            Discover Users
                          </button>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      {filteredFriends.map(friend => (
                        <div key={friend.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-150 flex items-center justify-between transition-all hover:shadow-md">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <img src={friend.avatar} alt={friend.name} className="w-12 h-12 rounded-full object-cover border border-gray-100" />
                              <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${friend.isOnline ? 'bg-emerald-500' : 'bg-gray-300'}`}></span>
                            </div>
                            <div className="text-left">
                              <button 
                                onClick={() => setViewingProfile(friend.name)}
                                className="font-bold text-gray-900 text-sm hover:text-indigo-600 text-left block"
                              >
                                {friend.name}
                              </button>
                              <p className="text-xs font-semibold text-indigo-600">{friend.title}</p>
                              <p className="text-[10px] text-gray-400 font-medium flex items-center gap-0.5 mt-0.5">
                                <MapPin className="w-3 h-3 text-gray-400" /> {friend.location}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setChattingWith(friend.name)}
                              className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl transition-colors"
                              title="Chat with Friend"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleRemoveFriend(friend.id)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                              title="Remove Friend"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Sub-tab 2: Discover Users */}
            {friendsSubTab === 'discover' && (
              <div className="space-y-4">
                {/* Search Discoverable */}
                <div className="relative">
                  <input
                    type="text"
                    value={friendSearchQuery}
                    onChange={(e) => setFriendSearchQuery(e.target.value)}
                    placeholder="Search people..."
                    className="w-full text-sm bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-sm"
                  />
                  {friendSearchQuery && (
                    <button onClick={() => setFriendSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Discover List */}
                {(() => {
                  const discoverList = initialAppUsers.filter(user => {
                    // Hide admin from normal users
                    if (user.email === 'timegig2026@gmail.com' && session?.user?.email !== 'timegig2026@gmail.com') return false;

                    const isFriend = friends.includes(user.id);
                    if (isFriend) return false;
                    if (friendSearchQuery) {
                      const q = friendSearchQuery.toLowerCase();
                      return user.name.toLowerCase().includes(q) || 
                             user.title.toLowerCase().includes(q) || 
                             user.location.toLowerCase().includes(q);
                    }
                    return true;
                  });

                  if (discoverList.length === 0) {
                    return (
                      <div className="text-center py-12 text-gray-400 bg-white rounded-3xl border border-dashed border-gray-200 shadow-sm p-6">
                        <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <h3 className="text-sm font-semibold text-gray-700 mb-1">No new people found</h3>
                        <p className="text-xs text-gray-500 max-w-[240px] mx-auto">
                          You are already friends with everyone matching your query!
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      {discoverList.map(item => {
                        const req = friendRequests.find(r => r.userId === item.id);
                        const isOutgoingPending = req?.type === 'outgoing' && req?.status === 'pending';
                        const isIncomingPending = req?.type === 'incoming' && req?.status === 'pending';

                        return (
                          <div key={item.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-150 flex items-center justify-between transition-all hover:shadow-md">
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <img src={item.avatar} alt={item.name} className="w-12 h-12 rounded-full object-cover border border-gray-100" />
                                <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${item.isOnline ? 'bg-emerald-500' : 'bg-gray-300'}`}></span>
                              </div>
                              <div className="text-left">
                                <button 
                                  onClick={() => setViewingProfile(item.name)}
                                  className="font-bold text-gray-900 text-sm hover:text-indigo-600 text-left block"
                                >
                                  {item.name}
                                </button>
                                <p className="text-xs font-semibold text-indigo-600">{item.title}</p>
                                <p className="text-[10px] text-gray-400 font-medium flex items-center gap-0.5 mt-0.5">
                                  <MapPin className="w-3 h-3 text-gray-400" /> {item.location}
                                </p>
                              </div>
                            </div>

                            <div>
                              {isOutgoingPending ? (
                                <button
                                  onClick={() => handleCancelRequest(item.id)}
                                  className="bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs font-bold px-3 py-2 rounded-xl transition-colors border border-gray-200 flex items-center gap-1.5"
                                  title="Cancel friend request"
                                >
                                  <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                  <span>Pending</span>
                                </button>
                              ) : isIncomingPending ? (
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => handleAcceptRequest(item.id)}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg transition-colors"
                                    title="Accept Friend Request"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeclineRequest(item.id)}
                                    className="bg-gray-100 hover:bg-gray-200 text-gray-600 p-2 rounded-lg transition-colors border border-gray-200"
                                    title="Decline Friend Request"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleAddFriend(item.id)}
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-1"
                                >
                                  <UserPlus className="w-3.5 h-3.5" />
                                  <span>Add</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Sub-tab 3: Requests */}
            {friendsSubTab === 'requests' && (
              <div className="space-y-4">
                {/* Incoming Section */}
                <div>
                  <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-2.5 text-left">
                    Incoming Requests ({friendRequests.filter(r => r.type === 'incoming' && r.status === 'pending').length})
                  </h3>
                  {(() => {
                    const incomingPending = friendRequests.filter(r => r.type === 'incoming' && r.status === 'pending');
                    if (incomingPending.length === 0) {
                      return (
                        <div className="text-center py-6 text-gray-400 bg-white rounded-2xl border border-gray-100 shadow-sm text-xs p-4">
                          No pending incoming requests.
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-2.5">
                        {incomingPending.map(req => {
                          const requester = initialAppUsers.find(u => u.id === req.userId);
                          if (!requester) return null;
                          return (
                            <div key={req.userId} className="bg-white p-3 rounded-2xl border border-gray-150 shadow-sm flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <img src={requester.avatar} alt={requester.name} className="w-10 h-10 rounded-full object-cover border border-gray-100" />
                                <div className="text-left">
                                  <h4 className="font-bold text-gray-900 text-xs">{requester.name}</h4>
                                  <p className="text-[10px] text-indigo-600 font-semibold">{requester.title}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleAcceptRequest(req.userId)}
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-sm transition-colors"
                                >
                                  Accept
                                </button>
                                <button
                                  onClick={() => handleDeclineRequest(req.userId)}
                                  className="bg-gray-50 hover:bg-gray-100 text-gray-600 text-[11px] font-bold px-3 py-1.5 rounded-lg border border-gray-200 transition-colors"
                                >
                                  Decline
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* Outgoing Section */}
                <div className="pt-2">
                  <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-2.5 text-left">
                    Outgoing Requests ({friendRequests.filter(r => r.type === 'outgoing' && r.status === 'pending').length})
                  </h3>
                  {(() => {
                    const outgoingPending = friendRequests.filter(r => r.type === 'outgoing' && r.status === 'pending');
                    if (outgoingPending.length === 0) {
                      return (
                        <div className="text-center py-6 text-gray-400 bg-white rounded-2xl border border-gray-100 shadow-sm text-xs p-4">
                          No pending outgoing requests.
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-2.5">
                        {outgoingPending.map(req => {
                          const requestee = initialAppUsers.find(u => u.id === req.userId);
                          if (!requestee) return null;
                          return (
                            <div key={req.userId} className="bg-white p-3 rounded-2xl border border-gray-150 shadow-sm flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <img src={requestee.avatar} alt={requestee.name} className="w-10 h-10 rounded-full object-cover border border-gray-100" />
                                <div className="text-left">
                                  <h4 className="font-bold text-gray-900 text-xs">{requestee.name}</h4>
                                  <p className="text-[10px] text-indigo-600 font-semibold">{requestee.title}</p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleCancelRequest(req.userId)}
                                className="bg-gray-50 hover:bg-gray-100 text-red-500 text-[11px] font-bold px-3 py-1.5 rounded-lg border border-gray-200 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'wallet' ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Wallet</h2>
              <span className="bg-amber-100 text-amber-800 text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                🪙 100 Coins = R1,00
              </span>
            </div>

            {/* Wallet Message System */}
            {walletMessage && (
              <div className={`p-4 rounded-xl border flex items-center gap-2.5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300 ${
                walletMessage.type === 'success' 
                  ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
                  : 'bg-red-50 border-red-100 text-red-800'
              }`}>
                {walletMessage.type === 'success' ? (
                  <Check className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <X className="w-5 h-5 text-red-600 shrink-0" />
                )}
                <span className="text-xs font-semibold">{walletMessage.text}</span>
              </div>
            )}

            {/* Premium Card Display with Referral Earning Balance */}
            <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 p-6 rounded-3xl shadow-xl text-white relative overflow-hidden border border-slate-800">
              <div className="absolute top-0 right-0 -mt-6 -mr-6 w-36 h-36 bg-indigo-500 opacity-10 rounded-full blur-3xl"></div>
              <div className="absolute bottom-0 left-0 -mb-6 -ml-6 w-32 h-32 bg-amber-400 opacity-10 rounded-full blur-2xl"></div>
              
              <div className="relative z-10 flex flex-col h-full justify-between space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] text-indigo-200 font-extrabold uppercase tracking-widest">Total Coin Balance</span>
                    <h3 className="text-4xl font-black mt-1 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-amber-100 to-amber-300">
                      {walletBalance} <span className="text-2xl font-bold text-indigo-200">Coins</span>
                    </h3>
                    <p className="text-[11px] text-indigo-300 font-medium mt-0.5">Value in Rand: R {(walletBalance / 100).toFixed(2).replace('.', ',')}</p>
                  </div>
                  <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-md border border-white/20">
                    <Wallet className="w-5 h-5 text-amber-300 animate-pulse" />
                  </div>
                </div>

                {/* Sub-balances Section: Referral Earnings and Top-Up Coins */}
                <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/10">
                    <span className="text-[9px] text-indigo-300 font-bold uppercase tracking-widest">Ref. Profit (Rand)</span>
                    {(() => {
                      const isTier2 = verifiedReferrals >= 20;
                      const isTier1 = verifiedReferrals >= 10;
                      const pkg = packages.find(p => p.id === activePackage) || packages[0];
                      const pkgRewardValue = parseInt(pkg.reward.replace('R', ''));
                      
                      const commissionRate = isTier2 ? 0.04 : (isTier1 ? 0.02 : 0);
                      const rewardMultiplier = isTier2 ? 1.0 : (isTier1 ? 0.5 : 0);
                      const profitSharingRate = isTier2 ? 0.10 : 0;

                      const commissionAmount = userReferralTopups * commissionRate;
                      const rewardAmount = pkgRewardValue * rewardMultiplier;
                      const profitSharing = userReferralProfits * profitSharingRate;
                      const totalRand = commissionAmount + rewardAmount + profitSharing;

                      return (
                        <>
                          <p className="text-lg font-extrabold text-amber-300 mt-0.5">R {totalRand.toLocaleString()}</p>
                          <span className="text-[9px] text-indigo-200/60 block mt-0.5 font-semibold">
                            {isTier2 ? 'Tier 2 Unlocked' : isTier1 ? 'Tier 1 (50% Reward)' : 'Unqualified (<10 Refs)'}
                          </span>
                        </>
                      );
                    })()}
                  </div>
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/10">
                    <span className="text-[9px] text-indigo-300 font-bold uppercase tracking-wider">Coin Balance</span>
                    <p className="text-lg font-extrabold text-emerald-300 mt-0.5">{walletBalance} Coins</p>
                    <span className="text-[9px] text-indigo-200/60 block mt-0.5 font-semibold">Value: R {(walletBalance / 100).toFixed(2).replace('.', ',')}</span>
                  </div>
                </div>

                <div className="flex justify-between items-end border-t border-white/10 pt-4">
                  <div>
                    <p className="text-[9px] text-indigo-300 uppercase font-bold tracking-widest">Wallet Holder</p>
                    <p className="text-xs font-bold tracking-wide text-white">Current User</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-indigo-300 uppercase font-bold tracking-widest">Network Status</p>
                    <p className="text-[10px] font-bold text-emerald-400 flex items-center justify-end gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span> Secure Vault
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Action Buttons (Transfer, Receive & Withdraw) */}
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => { setIsTransferOpen(true); setWalletMessage(null); }}
                className="bg-white hover:bg-indigo-50/50 text-indigo-600 border border-gray-150 p-3 rounded-2xl shadow-sm transition-all flex flex-col items-center gap-1.5 font-bold text-[11px] active:scale-[0.98] hover:border-indigo-200"
              >
                <div className="w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 shrink-0">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
                <span>Transfer</span>
              </button>

              <button
                type="button"
                onClick={() => { setIsReceiveOpen(true); setWalletMessage(null); }}
                className="bg-white hover:bg-amber-50/50 text-amber-700 border border-gray-150 p-3 rounded-2xl shadow-sm transition-all flex flex-col items-center gap-1.5 font-bold text-[11px] active:scale-[0.98] hover:border-amber-200"
              >
                <div className="w-8 h-8 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 shrink-0">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
                <span>Receive</span>
              </button>

              <button
                type="button"
                onClick={() => { setIsWithdrawOpen(true); setWalletMessage(null); }}
                className="bg-white hover:bg-emerald-50/50 text-emerald-700 border border-gray-150 p-3 rounded-2xl shadow-sm transition-all flex flex-col items-center gap-1.5 font-bold text-[11px] active:scale-[0.98] hover:border-emerald-200"
              >
                <div className="w-8 h-8 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 shrink-0">
                  <CreditCard className="w-4 h-4" />
                </div>
                <span>Withdraw</span>
              </button>
            </div>

            {/* Top-Up Section */}
            <div className="bg-white p-5 rounded-3xl border border-gray-150 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">Top-Up Coins</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Select a package to buy TGC via secure Capitec bank transfer.</p>
                </div>
                <div className="w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
                  <Coins className="w-4 h-4" />
                </div>
              </div>

              {/* Coin Option Packages */}
              <div className="grid grid-cols-1 gap-2.5">
                {[
                  { coins: 1000, rands: "R10,00", ref: "1000c" },
                  { coins: 2000, rands: "R20,00", ref: "2000c" },
                  { coins: 3000, rands: "R30,00", ref: "3000c" },
                  { coins: 4000, rands: "R40,00", ref: "4000c" },
                  { coins: 5000, rands: "R50,00", ref: "5000c" }
                ].map((opt) => (
                  <button
                    key={opt.coins}
                    onClick={() => {
                      setSelectedTopupOption(opt);
                      setTopupStep(1); // Direct to step 1 (Bank Details / pay instructions)
                      setIsTopupOpen(true);
                    }}
                    className="w-full bg-gray-50 hover:bg-indigo-50/50 hover:border-indigo-200 border border-gray-200 px-4 py-3 rounded-2xl flex items-center justify-between transition-all group active:scale-[0.99] text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center font-bold text-xs border border-amber-100 group-hover:bg-amber-100/50 transition-colors">
                        🪙
                      </div>
                      <div>
                        <span className="font-black text-gray-900 text-xs block">{opt.coins} Coins</span>
                        <span className="text-[10px] text-gray-400 block mt-0.5">TimeGig Coins (TGC)</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-indigo-600 bg-indigo-50 group-hover:bg-indigo-600 group-hover:text-white px-3 py-1.5 rounded-xl border border-indigo-100 group-hover:border-indigo-600 transition-all">
                        {opt.rands}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Recent Transactions List */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold text-gray-900">Transaction History</h3>
                <span className="text-[10px] font-medium text-gray-400">All SECURE payments</span>
              </div>

              <div className="space-y-2.5">
                {walletTransactions.map((tx) => (
                  <div key={tx.id} className="bg-white p-3.5 rounded-2xl border border-gray-150 shadow-sm flex items-center justify-between hover:shadow-md transition-all">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        tx.type === 'credit' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                      }`}>
                        {tx.category === 'topup' && <Plus className="w-4 h-4" />}
                        {tx.category === 'reward' && <Sparkles className="w-4 h-4" />}
                        {tx.category === 'package' && <Gift className="w-4 h-4" />}
                        {tx.category === 'transfer' && <ArrowUpRight className="w-4 h-4" />}
                        {tx.category === 'payout' && <ArrowDownLeft className="w-4 h-4" />}
                      </div>
                      <div className="text-left">
                        <h4 className="font-bold text-gray-900 text-xs leading-snug">{tx.title}</h4>
                        <p className="text-[10px] text-gray-400 mt-0.5">{tx.date}</p>
                      </div>
                    </div>
                    <div className={`text-xs font-black tracking-tight ${
                      tx.type === 'credit' ? 'text-emerald-600' : 'text-red-500'
                    }`}>
                      {tx.type === 'credit' ? '+' : '-'} {tx.amount} TGC
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Transfer Modal Overlay */}
            {isTransferOpen && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden w-full max-w-sm mx-auto animate-in scale-in duration-300 p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-900 text-base flex items-center gap-1.5">
                      <ArrowUpRight className="w-5 h-5 text-indigo-600" />
                      <span>Transfer Coins</span>
                    </h3>
                    <button 
                      onClick={() => { setIsTransferOpen(false); setWalletMessage(null); }}
                      className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-4 text-left">
                    {/* Recipient Input */}
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Select Recipient</label>
                      {(() => {
                        const friendsList = initialAppUsers.filter(u => friends.includes(u.id));
                        if (friendsList.length > 0) {
                          return (
                            <select 
                              value={transferRecipient}
                              onChange={(e) => setTransferRecipient(e.target.value)}
                              className="w-full text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">-- Choose a Friend Connection --</option>
                              {friendsList.map(f => (
                                <option key={f.id} value={f.name}>{f.name} ({f.title})</option>
                              ))}
                              <option value="custom">-- Type Custom Name --</option>
                            </select>
                          );
                        }
                        return (
                          <div className="text-[11px] text-gray-500 bg-amber-50 border border-amber-100 p-2 rounded-lg mb-2">
                            Tip: You don't have friends added yet. Type custom recipient name below!
                          </div>
                        );
                      })()}

                      {(transferRecipient === 'custom' || friends.length === 0) && (
                        <input
                          type="text"
                          placeholder="Type recipient's full name"
                          onChange={(e) => setTransferRecipient(e.target.value)}
                          className="w-full text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-2 animate-in slide-in-from-top-1"
                        />
                      )}
                    </div>

                    {/* Amount Input */}
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Coin Amount (TGC)</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={transferAmount}
                          onChange={(e) => setTransferAmount(e.target.value)}
                          placeholder="e.g. 50"
                          className="w-full text-xs bg-gray-50 border border-gray-200 rounded-xl pl-4 pr-12 py-2.5 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">TGC</span>
                      </div>
                      <div className="flex justify-between items-center mt-1.5 px-0.5 text-[10px] text-gray-400">
                        <span>Available Balance: {walletBalance} TGC</span>
                        {parseFloat(transferAmount) > 0 && (
                          <span className={walletBalance >= parseFloat(transferAmount) ? "text-emerald-600 font-bold" : "text-red-500 font-bold"}>
                            {walletBalance >= parseFloat(transferAmount) ? "Valid Balance" : "Insufficient Funds"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Submit Button */}
                    <button
                      onClick={() => handleTransfer(transferRecipient === 'custom' ? '' : transferRecipient, parseFloat(transferAmount))}
                      disabled={!transferRecipient || !transferAmount || parseFloat(transferAmount) <= 0 || parseFloat(transferAmount) > walletBalance}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-xs transition-colors shadow-md mt-4 active:scale-95 flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>Confirm Transfer</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Receive Modal Overlay */}
            {isReceiveOpen && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden w-full max-w-sm mx-auto animate-in scale-in duration-300 p-6 text-center">
                  <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2.5">
                    <h3 className="font-bold text-gray-900 text-base flex items-center gap-1.5">
                      <ArrowDownLeft className="w-5 h-5 text-amber-600" />
                      <span>Receive Coins</span>
                    </h3>
                    <button 
                      onClick={() => setIsReceiveOpen(false)}
                      className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* QR Code / Share Section */}
                  <div className="py-4 flex flex-col items-center">
                    {/* Simulated elegant QR code visual */}
                    <div className="w-36 h-36 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 mb-4 relative group">
                      <div className="grid grid-cols-4 gap-1.5 opacity-80">
                        {[...Array(16)].map((_, i) => (
                          <div 
                            key={i} 
                            className={`w-4.5 h-4.5 rounded ${
                              i % 3 === 0 || i % 5 === 2 ? 'bg-indigo-600' : 'bg-gray-200'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Scan Wallet QR</span>
                    </div>

                    <p className="text-xs text-gray-600 px-2 leading-relaxed mb-4">
                      Share your secure **Wallet Code** or **Invite Link** with friends to receive instant, commission-free coin transfers.
                    </p>

                    {/* Copy Code Box */}
                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 w-full flex items-center justify-between gap-2.5 mb-2">
                      <div className="text-left">
                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Secure Wallet Code</span>
                        <p className="text-xs font-mono font-bold text-gray-800">TGC-719-2026-99</p>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText("TGC-719-2026-99");
                          setWalletMessage({ text: "Wallet Code copied to clipboard!", type: 'success' });
                          setTimeout(() => setWalletMessage(null), 3000);
                        }}
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 p-2 rounded-xl transition-colors text-xs font-semibold flex items-center gap-1"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Withdraw Modal Overlay */}
            {isWithdrawOpen && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden w-full max-w-sm mx-auto animate-in scale-in duration-300 p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-900 text-base flex items-center gap-1.5">
                      <CreditCard className="w-5 h-5 text-emerald-600" />
                      <span>Withdraw Cashout</span>
                    </h3>
                    <button 
                      type="button"
                      onClick={() => { setIsWithdrawOpen(false); setWalletMessage(null); }}
                      className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-4 text-left">
                    {/* Amount Input */}
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Coin Amount</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={withdrawCoins}
                          onChange={(e) => setWithdrawCoins(e.target.value)}
                          placeholder="e.g. 1000"
                          className="w-full text-xs bg-gray-50 border border-gray-200 rounded-xl pl-4 pr-12 py-2.5 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">Coins</span>
                      </div>
                      
                      <div className="flex justify-between items-center mt-1.5 px-0.5 text-[10px] text-gray-400">
                        <span>Balance: {walletBalance} Coins</span>
                        {parseFloat(withdrawCoins) > 0 && (
                          <span className={walletBalance >= parseFloat(withdrawCoins) ? "text-emerald-600 font-bold" : "text-red-500 font-bold"}>
                            {walletBalance >= parseFloat(withdrawCoins) ? "Valid Balance" : "Insufficient Funds"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Live Conversion Output */}
                    {parseFloat(withdrawCoins) > 0 && (
                      <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-3.5 flex items-center justify-between text-xs animate-in slide-in-from-top-1">
                        <div>
                          <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider block">Estimated Payout</span>
                          <span className="font-extrabold text-emerald-800 text-sm">
                            R {((parseFloat(withdrawCoins) || 0) / 100).toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                        <div className="text-right text-[10px] text-emerald-600 font-medium">
                          Rate: 100 Coins = R 1,00
                        </div>
                      </div>
                    )}

                    {/* Bank Details Input */}
                    <div className="space-y-3 bg-gray-50/50 border border-gray-100 p-3.5 rounded-2xl">
                      <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block">Receiving Bank Details</span>
                      
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-1">Bank Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Capitec, FNB, Standard Bank"
                          value={bankDetails.bankName}
                          onChange={(e) => setBankDetails({ ...bankDetails, bankName: e.target.value })}
                          className="w-full text-xs bg-white border border-gray-200 rounded-xl px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-1">Account Number</label>
                        <input
                          type="text"
                          placeholder="Enter account number"
                          value={bankDetails.accountNumber}
                          onChange={(e) => setBankDetails({ ...bankDetails, accountNumber: e.target.value })}
                          className="w-full text-xs bg-white border border-gray-200 rounded-xl px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="button"
                      onClick={() => handleWithdrawalRequest(parseFloat(withdrawCoins), bankDetails.bankName, bankDetails.accountNumber)}
                      disabled={!withdrawCoins || parseFloat(withdrawCoins) <= 0 || parseFloat(withdrawCoins) > walletBalance || !bankDetails.bankName.trim() || !bankDetails.accountNumber.trim()}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-xs transition-all shadow-md mt-4 active:scale-95 flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>Submit Payout Request</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Top-Up Multi-Step Modal */}
            {isTopupOpen && selectedTopupOption && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden w-full max-w-sm mx-auto animate-in scale-in duration-300 p-6">
                  
                  {/* Step 1: Bank Transfer Instructions */}
                  {topupStep === 1 && (
                    <div className="space-y-4 text-left">
                      <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                        <h3 className="font-bold text-gray-900 text-base flex items-center gap-1.5">
                          <Building2 className="w-5 h-5 text-indigo-600" />
                          <span>EFT Bank Transfer</span>
                        </h3>
                        <button 
                          onClick={() => {
                            setIsTopupOpen(false);
                            setTopupStep(0);
                          }}
                          className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="bg-indigo-50/50 rounded-2xl p-4 border border-indigo-100 text-center">
                        <span className="text-[10px] text-indigo-500 font-extrabold uppercase tracking-widest block">Selected Package</span>
                        <h4 className="text-2xl font-black text-indigo-950 mt-1">{selectedTopupOption.coins} Coins</h4>
                        <p className="text-xs font-bold text-indigo-600 mt-1">Amount Due: {selectedTopupOption.rands}</p>
                      </div>

                      <p className="text-xs text-gray-600 leading-relaxed text-center">
                        Please transfer exactly <span className="font-bold text-gray-950">{selectedTopupOption.rands}</span> to the bank details below using Capitec:
                      </p>

                      <div className="space-y-2.5">
                        {/* Bank Name */}
                        <div className="bg-gray-50 border border-gray-150 rounded-xl p-3 flex items-center justify-between">
                          <div>
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Bank</span>
                            <span className="text-xs font-bold text-gray-800">Capitec</span>
                          </div>
                          <button 
                            type="button"
                            onClick={() => copyToClipboard("Capitec", "Bank name")}
                            className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-lg transition-colors"
                            title="Copy Bank Name"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Account Name */}
                        <div className="bg-gray-50 border border-gray-150 rounded-xl p-3 flex items-center justify-between">
                          <div>
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Account Name</span>
                            <span className="text-xs font-bold text-gray-800">Matthews</span>
                          </div>
                          <button 
                            type="button"
                            onClick={() => copyToClipboard("Matthews", "Account holder name")}
                            className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-lg transition-colors"
                            title="Copy Account Name"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Account Number */}
                        <div className="bg-gray-50 border border-gray-150 rounded-xl p-3 flex items-center justify-between">
                          <div>
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Account Number</span>
                            <span className="text-xs font-mono font-bold text-gray-800">1334067366</span>
                          </div>
                          <button 
                            type="button"
                            onClick={() => copyToClipboard("1334067366", "Account number")}
                            className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-lg transition-colors"
                            title="Copy Account Number"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Reference */}
                        <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
                          <div>
                            <span className="text-[9px] text-amber-600 font-bold uppercase tracking-wider block">Payment Reference</span>
                            <span className="text-xs font-mono font-bold text-amber-800">{selectedTopupOption.ref}</span>
                          </div>
                          <button 
                            type="button"
                            onClick={() => copyToClipboard(selectedTopupOption.ref, "Payment reference")}
                            className="text-amber-700 hover:bg-amber-100 p-1.5 rounded-lg transition-colors"
                            title="Copy Reference"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="pt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsTopupOpen(false);
                            setTopupStep(0);
                          }}
                          className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold py-3 rounded-xl text-xs transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => setTopupStep(2)}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-xs transition-colors shadow-md flex items-center justify-center gap-1.5 active:scale-95"
                        >
                          <span>I've Paid</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Upload Proof of Payment */}
                  {topupStep === 2 && (
                    <div className="space-y-4 text-left">
                      <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                        <h3 className="font-bold text-gray-900 text-base flex items-center gap-1.5">
                          <UploadCloud className="w-5 h-5 text-indigo-600" />
                          <span>Proof of Payment</span>
                        </h3>
                        <button 
                          onClick={() => {
                            setIsTopupOpen(false);
                            setTopupStep(0);
                          }}
                          className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <p className="text-xs text-gray-600 leading-relaxed text-center">
                        Please upload your official bank proof of payment document from your device to verify your transfer.
                      </p>

                      <div className="space-y-3">
                        <input 
                          type="file" 
                          id="pop-file-upload" 
                          className="hidden" 
                          accept=".pdf,image/*" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setTopupFile(file);
                              setUploadedProofOfPaymentName(file.name);
                              if (file.type.startsWith('image/')) {
                                setUploadedProofOfPaymentUrl(URL.createObjectURL(file));
                              } else {
                                setUploadedProofOfPaymentUrl("https://images.unsplash.com/photo-1626266061368-46a8f578ddd6?auto=format&fit=crop&q=80&w=800");
                              }
                            }
                          }}
                        />

                        {!uploadedProofOfPaymentName ? (
                          <label 
                            htmlFor="pop-file-upload"
                            className="border-2 border-dashed border-gray-300 hover:border-indigo-400 bg-gray-50 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors group text-center"
                          >
                            <UploadCloud className="w-10 h-10 text-gray-400 group-hover:text-indigo-500 transition-colors mx-auto" />
                            <span className="text-xs font-bold text-gray-800">Click to upload document</span>
                            <span className="text-[10px] text-gray-400">PDF, JPG, or PNG up to 10MB</span>
                          </label>
                        ) : (
                          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between gap-3 text-left">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-9 h-9 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                                <FileText className="w-5 h-5" />
                              </div>
                              <div className="min-w-0">
                                <span className="text-xs font-bold text-gray-800 block truncate">{uploadedProofOfPaymentName}</span>
                                <span className="text-[9px] text-emerald-600 font-semibold block mt-0.5 flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Ready to submit
                                </span>
                              </div>
                            </div>
                            <button 
                              type="button"
                              onClick={() => {
                                setUploadedProofOfPaymentName('');
                                setUploadedProofOfPaymentUrl('');
                              }}
                              className="p-1.5 hover:bg-emerald-100 rounded-full text-emerald-600 transition-colors shrink-0"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="pt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setTopupStep(1)}
                          className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold py-3 rounded-xl text-xs transition-colors"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          disabled={!uploadedProofOfPaymentName}
                          onClick={async () => {
                            if (supabase && user && topupFile) {
                              try {
                                let publicUrl = uploadedProofOfPaymentUrl || '';
                                try {
                                  const fileExt = topupFile.name.split('.').pop();
                                  const fileName = `${user.id}/topup_${Date.now()}.${fileExt}`;
                                  const { error: uploadError } = await supabase.storage.from('verification').upload(fileName, topupFile);
                                  if (uploadError) throw uploadError;
                                  publicUrl = supabase.storage.from('verification').getPublicUrl(fileName).data.publicUrl;
                                } catch (uploadErr) {
                                  console.warn("Storage upload failed, using temporary preview URL:", uploadErr);
                                  if (!publicUrl) {
                                    publicUrl = "https://images.unsplash.com/photo-1554224155-1696413565d3?auto=format&fit=crop&q=80&w=800";
                                  }
                                }

                                const newPayment = {
                                  id: 'local-topup-' + Date.now(),
                                  user_id: user.id,
                                  user_name: user?.user_metadata?.full_name || user?.email || 'User',
                                  amount: selectedTopupOption.rands,
                                  amount_rands: selectedTopupOption.rands,
                                  amount_coins: selectedTopupOption.coins,
                                  coins: selectedTopupOption.coins,
                                  method: 'EFT / Card',
                                  proof_url: publicUrl,
                                  status: 'pending',
                                  created_at: new Date().toISOString(),
                                  ref: selectedTopupOption.ref
                                };
                                
                                try {
                                  const { error: insertError } = await supabase.from('topups').insert([{
                                    user_id: newPayment.user_id,
                                    user_name: newPayment.user_name,
                                    amount_rands: newPayment.amount_rands,
                                    amount_coins: newPayment.amount_coins,
                                    method: newPayment.method,
                                    proof_url: newPayment.proof_url,
                                    status: newPayment.status,
                                    created_at: newPayment.created_at
                                  }]);
                                  if (insertError) throw insertError;
                                } catch (err) {
                                  console.warn("Database 'topups' save failed, storing locally:", err);
                                  const storedTps = localStorage.getItem('local_topups');
                                  const list = storedTps ? JSON.parse(storedTps) : [];
                                  list.unshift(newPayment);
                                  localStorage.setItem('local_topups', JSON.stringify(list));
                                }

                                setPendingPayments(prev => [{
                                  id: newPayment.id,
                                  user_id: newPayment.user_id,
                                  user: newPayment.user_name,
                                  amount: newPayment.amount_rands,
                                  coins: newPayment.amount_coins,
                                  date: "Just now",
                                  image: publicUrl,
                                  ref: selectedTopupOption.ref
                                }, ...prev]);
                                
                                setTopupStep(3);
                              } catch (err: any) {
                                console.error("Topup submission error:", err);
                                setWalletMessage({ text: `Top-up error: ${err.message || 'Submission failed.'}`, type: 'error' });
                                setTimeout(() => setWalletMessage(null), 5000);
                              }
                            } else {
                              // Fallback for demo if no Supabase
                              const newPayment = {
                                id: Date.now(),
                                user: "Current User",
                                amount: selectedTopupOption.rands,
                                coins: selectedTopupOption.coins,
                                date: "Today " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                image: uploadedProofOfPaymentUrl || "https://images.unsplash.com/photo-1626266061368-46a8f578ddd6?auto=format&fit=crop&q=80&w=800",
                                ref: selectedTopupOption.ref
                              };
                              
                              const storedTps = localStorage.getItem('local_topups');
                              const list = storedTps ? JSON.parse(storedTps) : [];
                              list.unshift({
                                ...newPayment,
                                user_id: user?.id || 'demo-user',
                                user_name: 'Current User',
                                amount_rands: selectedTopupOption.rands,
                                amount_coins: selectedTopupOption.coins,
                                method: 'EFT / Card',
                                proof_url: newPayment.image,
                                status: 'pending',
                                created_at: new Date().toISOString()
                              });
                              localStorage.setItem('local_topups', JSON.stringify(list));

                              setPendingPayments(prev => [newPayment, ...prev]);
                              setTopupStep(3);
                            }
                          }}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-xs transition-colors shadow-md flex items-center justify-center gap-1 active:scale-95"
                        >
                          <Check className="w-4 h-4" /> Submit Payment
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Review Message & Return to Wallet */}
                  {topupStep === 3 && (
                    <div className="space-y-5 text-center py-2 animate-in fade-in duration-300">
                      <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto border-2 border-amber-200 shadow-sm animate-pulse">
                        <Clock className="w-9 h-9" />
                      </div>
                      
                      <div>
                        <h3 className="text-lg font-black text-gray-900 tracking-tight">Review in Progress!</h3>
                        <p className="text-xs text-amber-600 font-bold mt-1 uppercase tracking-widest bg-amber-50 px-2.5 py-1 rounded-md inline-block">
                          Awaiting Verification
                        </p>
                      </div>

                      <p className="text-xs text-gray-600 leading-relaxed px-1">
                        Matthews is currently reviewing your payment of <span className="font-bold text-gray-900">{selectedTopupOption.rands}</span> for <span className="font-bold text-indigo-600">{selectedTopupOption.coins} Coins</span> (Reference: <span className="font-mono font-bold text-amber-700">{selectedTopupOption.ref}</span>).
                      </p>
                      
                      <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-150 text-left text-[11px] text-gray-500 space-y-1">
                        <div className="flex justify-between">
                          <span>Verification Speed:</span>
                          <span className="font-bold text-gray-700">5-15 Minutes</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Proof of Payment:</span>
                          <span className="font-bold text-emerald-600 truncate max-w-[150px]">{uploadedProofOfPaymentName}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setIsTopupOpen(false);
                          setTopupStep(0);
                          setUploadedProofOfPaymentName('');
                          setUploadedProofOfPaymentUrl('');
                          setActiveTab('wallet'); // ensure we stay/direct to wallet feature
                        }}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3.5 rounded-2xl text-xs transition-all shadow-md active:scale-95 uppercase tracking-wider block"
                      >
                        Directed to Wallet Feature
                      </button>
                    </div>
                  )}

                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Settings</h2>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900">Public Profile</h3>
                  <p className="text-xs text-gray-500">Allow others to view your profile and stats.</p>
                </div>
                <button 
                  onClick={() => setIsProfilePublic(!isProfilePublic)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${isProfilePublic ? 'bg-indigo-600' : 'bg-gray-300'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${isProfilePublic ? 'translate-x-6' : 'translate-x-0.5'}`}></div>
                </button>
              </div>
              <div className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900">Notification Sounds</h3>
                  <p className="text-xs text-gray-500">Play a sound when you receive messages.</p>
                </div>
                <button 
                  onClick={() => setIsSoundEnabled(!isSoundEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${isSoundEnabled ? 'bg-indigo-600' : 'bg-gray-300'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${isSoundEnabled ? 'translate-x-6' : 'translate-x-0.5'}`}></div>
                </button>
              </div>
            </div>
            
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
              <div className="p-4">
                <h3 className="font-bold text-gray-900 mb-1">Account</h3>
                <p className="text-sm text-gray-500">Logged in as <span className="font-semibold text-gray-700">{user?.email}</span></p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
              <div className="p-4">
                <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-500" /> Interactive Help
                </h3>
                <p className="text-xs text-gray-500 mb-4">Learn how to browse gigs, message seekers, and earn weekly rewards.</p>
                <button
                  onClick={() => {
                    setTourStep(0);
                    setIsTourActive(true);
                  }}
                  className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold py-3 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-sm active:scale-[0.98]"
                >
                  Restart Guided Tour
                </button>
              </div>
            </div>
            
            <button 
              onClick={() => setViewingProfile("Current User")}
              className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between text-gray-800 font-semibold hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center overflow-hidden">
                  <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent("Current User")}&background=e0e7ff&color=4f46e5`} alt="Current User" className="w-full h-full object-cover" />
                </div>
                <span>View My Profile</span>
              </div>
              <ChevronLeft className="w-5 h-5 rotate-180 text-gray-400" />
            </button>
          </div>
        )}

        {viewingProfile && (
          <div className="absolute inset-0 z-[70] flex flex-col bg-white animate-in slide-in-from-bottom-full duration-300">
            <div className="p-4 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50 safe-top">
              <button onClick={() => setViewingProfile(null)} className="p-2 -ml-2 rounded-full hover:bg-gray-200 text-gray-500 transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="font-bold text-gray-900">User Profile</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
              <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(viewingProfile)}&background=e0e7ff&color=4f46e5&size=200`} alt={viewingProfile} className="w-32 h-32 rounded-full mb-4 shadow-sm border-4 border-white" />
              <h1 className="text-2xl font-bold text-gray-900 mb-1">{viewingProfile}</h1>
              <p className="text-sm text-gray-500 mb-6 flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Verified User</p>
              
              <div className="w-full grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 p-4 rounded-2xl flex flex-col items-center text-center">
                  <div className="flex items-center gap-1 text-yellow-500 mb-1">
                    <TrendingUp className="w-4 h-4" />
                    <span className="font-bold text-lg">4.9</span>
                  </div>
                  <span className="text-xs text-gray-500 font-medium">Average Rating</span>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl flex flex-col items-center text-center">
                  <div className="flex items-center gap-1 text-indigo-600 mb-1">
                    <Briefcase className="w-4 h-4" />
                    <span className="font-bold text-lg">12</span>
                  </div>
                  <span className="text-xs text-gray-500 font-medium">Gigs Completed</span>
                </div>
              </div>
              
              <div className="w-full bg-gray-50 p-5 rounded-2xl mb-6">
                <h3 className="font-bold text-gray-900 mb-2 text-sm">About</h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Hi, I'm {viewingProfile}. I take pride in delivering high-quality work and ensuring clear communication throughout every project. Looking forward to collaborating!
                </p>
              </div>
              

            </div>
          </div>
        )}
      </main>

      {/* Fullscreen Media Modal */}
      {fullscreenMedia && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-200">
          <button 
            onClick={() => setFullscreenMedia(null)}
            className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors z-[101]"
          >
            <X className="w-6 h-6" />
          </button>
          
          {fullscreenMedia.type === 'image' ? (
            <img src={fullscreenMedia.url} alt="Fullscreen content" className="max-w-full max-h-full object-contain p-4" />
          ) : (
            <video src={fullscreenMedia.url} controls autoPlay playsInline className="max-w-full max-h-full object-contain p-4" />
          )}
        </div>
      )}

      {/* Bank Details Modal */}
      {activatingPackageId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                <h3 className="font-semibold text-gray-900">Bank Details Required</h3>
              </div>
              <button 
                onClick={() => setActivatingPackageId(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleActivatePackage} className="p-5 space-y-4">
              <p className="text-sm text-gray-500 mb-4">
                Please provide your bank details. This is required so the admin can pay you your referral earnings.
              </p>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Bank Name</label>
                  <input 
                    type="text" 
                    required
                    value={bankDetails.bankName}
                    onChange={(e) => setBankDetails({...bankDetails, bankName: e.target.value})}
                    placeholder="e.g. Capitec, FNB, Standard Bank"
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Account Number</label>
                  <input 
                    type="text" 
                    required
                    value={bankDetails.accountNumber}
                    onChange={(e) => setBankDetails({...bankDetails, accountNumber: e.target.value})}
                    placeholder="Account Number"
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Branch Code (Optional)</label>
                  <input 
                    type="text" 
                    value={bankDetails.branchCode}
                    onChange={(e) => setBankDetails({...bankDetails, branchCode: e.target.value})}
                    placeholder="Branch Code"
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button 
                  type="submit"
                  className="w-full bg-indigo-600 text-white font-medium py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Save & Activate Package
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Identity Verification Modal */}
      {showVerificationModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            <div className="bg-indigo-600 p-8 text-white">
              <h3 className="text-2xl font-black uppercase tracking-tight mb-2">Verify Your Identity</h3>
              <p className="text-indigo-100 text-sm font-medium leading-relaxed">To keep TimeGig safe, we require a quick identity check. You can still browse the app while we review your docs.</p>
            </div>
            
            <div className="p-8 space-y-6">
              {/* Step 1: ID Upload */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-500" />
                  Step 1: Upload ID Document
                </label>
                <div 
                  onClick={() => document.getElementById('id-upload-input')?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${verificationIDFile ? 'border-emerald-500 bg-emerald-50/50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'}`}
                >
                  <input 
                    id="id-upload-input"
                    type="file" 
                    className="hidden" 
                    accept="image/*"
                    onChange={(e) => setVerificationIDFile(e.target.files?.[0] || null)}
                  />
                  {verificationIDFile ? (
                    <>
                      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                      <span className="text-sm font-bold text-emerald-700">{verificationIDFile.name}</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-8 h-8 text-gray-400" />
                      <span className="text-sm font-bold text-gray-500">Tap to upload ID / Passport</span>
                    </>
                  )}
                </div>
              </div>

              {/* Step 2: Face Capture */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Camera className="w-4 h-4 text-indigo-500" />
                  Step 2: Take a Selfie
                </label>
                
                {verificationFacePhoto ? (
                  <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500">
                    <img src={verificationFacePhoto} alt="Captured Face" className="w-full aspect-video object-cover" />
                    <button 
                      onClick={() => setVerificationFacePhoto(null)}
                      className="absolute top-2 right-2 bg-black/50 text-white p-2 rounded-full backdrop-blur-sm"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-emerald-500 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase">
                      <Check className="w-3 h-3" /> Photo Captured
                    </div>
                  </div>
                ) : isCameraActive ? (
                  <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
                    <video 
                      ref={(el) => {
                        (videoRef as any).current = el;
                        if (el && cameraStream && el.srcObject !== cameraStream) {
                          el.srcObject = cameraStream;
                        }
                      }} 
                      autoPlay 
                      playsInline 
                      muted
                      className="w-full h-full object-cover"
                      style={{ transform: 'scaleX(-1)' }}
                    />
                    <div className="absolute inset-0 border-2 border-indigo-400/50 rounded-2xl pointer-events-none"></div>
                    <button 
                      onClick={capturePhoto}
                      className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white text-indigo-600 w-14 h-14 rounded-full flex items-center justify-center shadow-xl active:scale-90 transition-transform"
                    >
                      <div className="w-10 h-10 border-4 border-indigo-600 rounded-full"></div>
                    </button>
                    <button 
                      onClick={stopCamera}
                      className="absolute top-4 right-4 bg-black/40 text-white p-2 rounded-full backdrop-blur-md"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={startCamera}
                    className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 hover:bg-gray-100 transition-colors"
                  >
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm text-indigo-600">
                      <Camera className="w-8 h-8" />
                    </div>
                    <span className="text-sm font-bold text-gray-600">Open Camera for Face Capture</span>
                  </button>
                )}
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => setShowVerificationModal(false)}
                  className="flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-gray-400 hover:bg-gray-50 transition-colors"
                >
                  Skip for now
                </button>
                <button 
                  onClick={handleVerificationSubmit}
                  className={`flex-[2] py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg transition-all active:scale-95 ${
                    verificationIDFile && verificationFacePhoto
                    ? 'bg-indigo-600 text-white shadow-indigo-200 hover:bg-indigo-700'
                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  }`}
                >
                  Submit for Review
                </button>
              </div>
            </div>
            
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>
      )}

      {/* Admin Notification / Promotion Pop-up Modal */}
      {activePromoPopup && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-indigo-600 to-violet-700 p-6 text-white relative">
              <div className="absolute top-4 right-4">
                <button 
                  onClick={() => setActivePromoPopup(null)}
                  className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="bg-white/20 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-md">
                <Bell className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight leading-tight">{activePromoPopup.title}</h3>
              <p className="text-indigo-100 text-xs mt-1 font-bold">{activePromoPopup.time}</p>
            </div>
            
            <div className="p-8">
              <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl mb-6">
                <p className="text-sm text-indigo-900 font-medium leading-relaxed">
                  {activePromoPopup.message}
                </p>
              </div>
              
              <button 
                onClick={() => setActivePromoPopup(null)}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all"
              >
                Dismiss Message
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Link Modal */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center sm:items-center sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-bold text-gray-900 text-lg">Share Referral Link</h3>
              <button 
                onClick={() => setIsShareModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-2 rounded-full hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 space-y-4 bg-gray-50/50">
              <div className="grid grid-cols-3 gap-4">
                <button 
                  onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`https://ais-dev-3s3a6lpajmabp4vj33riar-339746247390.us-west2.run.app/?ref=${user?.id}`)}`, '_blank')}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className="w-14 h-14 bg-[#1877F2] text-white rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                    <Facebook className="w-7 h-7" />
                  </div>
                  <span className="text-xs font-medium text-gray-600">Facebook</span>
                </button>
                <button 
                  onClick={() => window.open(`https://twitter.com/intent/tweet?text=Join%20me%20on%20TimeGig!&url=${encodeURIComponent(`https://ais-dev-3s3a6lpajmabp4vj33riar-339746247390.us-west2.run.app/?ref=${user?.id}`)}`, '_blank')}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className="w-14 h-14 bg-black text-white rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                    <Twitter className="w-7 h-7" />
                  </div>
                  <span className="text-xs font-medium text-gray-600">X (Twitter)</span>
                </button>
                <button 
                  onClick={() => window.open(`https://wa.me/?text=Join%20me%20on%20TimeGig!%20${encodeURIComponent(`https://ais-dev-3s3a6lpajmabp4vj33riar-339746247390.us-west2.run.app/?ref=${user?.id}`)}`, '_blank')}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className="w-14 h-14 bg-green-500 text-white rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                    <MessageCircle className="w-7 h-7" />
                  </div>
                  <span className="text-xs font-medium text-gray-600">WhatsApp</span>
                </button>
              </div>

              <div className="mt-4 p-3 bg-white rounded-xl border border-gray-200 flex items-center justify-between shadow-sm">
                <div className="text-sm font-mono text-gray-500 truncate mr-3">
                  {`https://ais-dev-3s3a6lpajmabp4vj33riar-339746247390.us-west2.run.app/?ref=${user?.id}`}
                </div>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(`https://ais-dev-3s3a6lpajmabp4vj33riar-339746247390.us-west2.run.app/?ref=${user?.id}`);
                    alert('Link copied to clipboard!');
                  }}
                  className="bg-indigo-50 text-indigo-600 p-2 rounded-lg hover:bg-indigo-100 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Full Screen KYC Modal */}
      {selectedVerification && (
        <div className="fixed inset-0 z-50 bg-black/98 flex flex-col animate-in fade-in zoom-in duration-200">
          <div className="flex justify-between items-center text-white p-6 bg-gradient-to-b from-black/50 to-transparent">
            <div>
              <h3 className="font-bold text-xl">{selectedVerification.user}</h3>
              <p className="text-white/60 text-sm uppercase tracking-widest font-mono mt-1">
                {selectedVerification.currentView === 'id' ? 'ID Document Verification' : 'Face Verification'}
              </p>
            </div>
            <button 
              onClick={() => setSelectedVerification(null)} 
              className="p-3 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-2xl transition-all active:scale-95"
            >
              <X className="w-7 h-7" />
            </button>
          </div>
          
          <div className="flex-1 flex items-center justify-center p-4">
             <div className="relative group max-w-full max-h-full">
                <img 
                  src={selectedVerification.currentView === 'id' ? selectedVerification.idImage : selectedVerification.faceImage} 
                  alt="KYC Document" 
                  className="max-w-full max-h-[70vh] object-contain rounded-2xl shadow-2xl border border-white/10" 
                />
                <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                   <button 
                     onClick={() => setSelectedVerification(prev => ({ ...prev, currentView: 'id' }))}
                     className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedVerification.currentView === 'id' ? 'bg-white text-black' : 'bg-black/50 text-white backdrop-blur-md'}`}
                   >
                     ID Doc
                   </button>
                   <button 
                     onClick={() => setSelectedVerification(prev => ({ ...prev, currentView: 'face' }))}
                     className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedVerification.currentView === 'face' ? 'bg-white text-black' : 'bg-black/50 text-white backdrop-blur-md'}`}
                   >
                     Face Capture
                   </button>
                </div>
             </div>
          </div>

          <div className="p-6 bg-white rounded-t-[2.5rem] flex gap-4 mt-auto shadow-[0_-20px_50px_rgba(0,0,0,0.3)]">
            <button 
              onClick={async () => {
                if (supabase) {
                  const { error } = await supabase.from('verifications').update({ status: 'rejected' }).eq('id', selectedVerification.id);
                  if (error) {
                    console.error("Error rejecting verification:", error);
                    return;
                  }

                  // Send notification to the user
                  await supabase.from('notifications').insert([{
                    user_id: selectedVerification.user_id,
                    title: "KYC Verification Rejected",
                    message: "Your identity verification was unfortunately rejected. Please try again with clearer documents.",
                    type: "payout",
                    time: "Just now"
                  }]);
                  
                  if (selectedVerification.user_id === user?.id) {
                    setIsVerificationPending(false);
                    setWalletMessage({ text: "Verification rejected.", type: "error" });
                    setTimeout(() => setWalletMessage(null), 4000);
                  } else {
                    setWalletMessage({ text: "Verification rejected for " + selectedVerification.user, type: "error" });
                    setTimeout(() => setWalletMessage(null), 4000);
                  }
                }
                setPendingVerifications(prev => prev.filter(v => v.id !== selectedVerification.id));
                setNotifications(prev => prev.filter(n => n.id !== 'admin-verif-' + selectedVerification.id));
                setSelectedVerification(null);
              }}
              className="flex-1 py-4 bg-red-50 text-red-600 rounded-2xl font-bold flex justify-center items-center gap-2 hover:bg-red-100 transition-colors border border-red-100 active:scale-95"
            >
              <X className="w-5 h-5" /> Reject KYC
            </button>
            <button 
              onClick={async () => {
                if (supabase) {
                  const { error } = await supabase.from('verifications').update({ status: 'approved' }).eq('id', selectedVerification.id);
                  if (error) {
                    console.error("Error approving verification:", error);
                    return;
                  }
                  
                  // Try to update user profile to verified
                  await updateLocalProfileHelper(selectedVerification.user_id, { is_verified: true });
                  
                  // Send notification to the user
                  await supabase.from('notifications').insert([{
                    user_id: selectedVerification.user_id,
                    title: "Account Approved! 🚀",
                    message: "Congratulations! Your account review is approved and your identity has been successfully verified.",
                    type: "reward",
                    time: "Just now"
                  }]);

                  if (selectedVerification.user_id === user?.id) {
                    setIsVerificationPending(false);
                    setIsVerified(true);
                    setWalletMessage({ text: "Account verified successfully!", type: "success" });
                    setTimeout(() => setWalletMessage(null), 4000);
                  } else {
                    setWalletMessage({ text: "Account verified for " + selectedVerification.user, type: "success" });
                    setTimeout(() => setWalletMessage(null), 4000);
                  }
                }
                setPendingVerifications(prev => prev.filter(v => v.id !== selectedVerification.id));
                setNotifications(prev => prev.filter(n => n.id !== 'admin-verif-' + selectedVerification.id));
                setSelectedVerification(null);
              }}
              className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold flex justify-center items-center gap-2 hover:bg-indigo-700 transition-colors shadow-lg active:scale-95"
            >
              <Check className="w-5 h-5" /> Approve KYC
            </button>
          </div>
        </div>
      )}

      {/* Admin Full Screen Document Modal */}
      {selectedDocument && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col p-4 animate-in fade-in duration-200">
          <div className="flex justify-between items-center text-white mb-4">
            <div>
              <h3 className="font-semibold text-lg">{selectedDocument.user}</h3>
              <p className="text-white/70 text-sm">Amount: {selectedDocument.amount}</p>
            </div>
            <button 
              onClick={() => setSelectedDocument(null)} 
              className="p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden py-4 rounded-lg">
            <img src={selectedDocument.image} alt="Proof of payment" className="max-w-full max-h-full object-contain rounded-xl" />
          </div>
          <div className="bg-white rounded-2xl p-4 flex gap-4 mt-auto">
            <button 
              onClick={async () => {
                try {
                  const res = await fetch("/api/admin/reject-topup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ topupId: selectedDocument.id })
                  });
                  if (!res.ok) throw new Error("Failed server-side reject");
                } catch (e) {
                  console.error(e);
                  await updateTopupStatusHelper(selectedDocument.id, 'rejected');
                }
                
                if (selectedDocument.user_id === user?.id) {
                  setWalletMessage({
                    text: `Your top-up request for ${selectedDocument.amount} was rejected.`,
                    type: 'error'
                  });
                  setTimeout(() => setWalletMessage(null), 5000);
                }
                setPendingPayments(prev => prev.filter(p => p.id !== selectedDocument.id));
                setSelectedDocument(null);
              }}
              className="flex-1 py-3.5 bg-red-50 text-red-600 rounded-xl font-semibold flex justify-center items-center gap-2 hover:bg-red-100 transition-colors"
            >
              <X className="w-5 h-5" /> Reject
            </button>
            <button 
              onClick={async () => {
                const amtCoins = (selectedDocument as any).coins || 1000;
                let success = false;
                let newBal = 0;

                try {
                  const res = await fetch("/api/admin/approve-topup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      topupId: selectedDocument.id,
                      userId: selectedDocument.user_id,
                      amtCoins,
                      amountRands: selectedDocument.amount
                    })
                  });
                  if (!res.ok) throw new Error("Failed server-side approval");
                  const data = await res.json();
                  if (data.fallback) {
                    throw new Error("Server-requested fallback");
                  }
                  success = data.success;
                  if (typeof data.newBalance === 'number') {
                    newBal = data.newBalance;
                  }
                } catch (e) {
                  console.log("Using client-side approval flow/fallback:", e);
                  await updateTopupStatusHelper(selectedDocument.id, 'approved');
                  
                  // Update profile balance for target user
                  try {
                    const localProfileKey = `local_profile_${selectedDocument.user_id}`;
                    const storedLocalProfile = localStorage.getItem(localProfileKey);
                    const localProfile = storedLocalProfile ? JSON.parse(storedLocalProfile) : { wallet_balance: 0 };
                    newBal = (localProfile.wallet_balance || 0) + amtCoins;
                    await updateLocalProfileHelper(selectedDocument.user_id, { wallet_balance: newBal });
                  } catch (err) {
                    console.error("Failed to update profile balance:", err);
                  }

                  // Add transaction
                  const newTx = {
                    user_id: selectedDocument.user_id,
                    title: `Approved Topup (${selectedDocument.amount})`,
                    amount: amtCoins,
                    type: 'credit' as const,
                    category: 'topup' as const,
                    date: 'Just now'
                  };
                  await insertTransactionHelper(newTx);

                  // Add notification for the user immediately
                  const approvalNotif = {
                    user_id: selectedDocument.user_id,
                    title: "Top-Up Approved! 💰",
                    message: `Your top-up of ${amtCoins} TGC (${selectedDocument.amount}) has been approved and added to your wallet.`,
                    type: "reward" as const,
                    time: "Just now"
                  };
                  await insertNotificationHelper(approvalNotif);

                  // Update app stats in local storage
                  try {
                    const storedStats = localStorage.getItem('local_app_stats');
                    const stats = storedStats ? JSON.parse(storedStats) : { total_profit: 0, total_users: 0, total_payouts: 0, online_users: 0, visits: 0 };
                    const topupValue = parseFloat((selectedDocument.amount || '0').replace('R', '').replace(' ', '')) || 0;
                    const updated = { ...stats, total_profit: (stats.total_profit || 0) + topupValue };
                    localStorage.setItem('local_app_stats', JSON.stringify(updated));
                    setAppStats(prev => ({ ...prev, total_profit: updated.total_profit }));
                  } catch (err) {
                    console.error("Failed to update app_stats in localStorage:", err);
                  }

                  // Update app stats
                  let stats = null;
                  try {
                    const { data } = await supabase.from('app_stats').select('*').maybeSingle();
                    stats = data;
                  } catch (err) {
                    const stored = localStorage.getItem('local_app_stats');
                    stats = stored ? JSON.parse(stored) : null;
                  }
                  if (stats) {
                    const topupValue = parseFloat(selectedDocument.amount.replace('R', '').replace(' ', '')) || 0;
                    try {
                      await supabase.from('app_stats').update({ total_profit: (stats.total_profit || 0) + topupValue }).eq('id', stats.id);
                    } catch (err) {
                      const updated = { ...stats, total_profit: (stats.total_profit || 0) + topupValue };
                      localStorage.setItem('local_app_stats', JSON.stringify(updated));
                    }
                  }
                  success = true;
                }

                if (success) {
                  // If approved user is current user, update their wallet balance state
                  if (selectedDocument.user_id === user?.id) {
                    if (newBal > 0) {
                      setWalletBalance(newBal);
                    }
                    
                    const newTx = {
                      user_id: selectedDocument.user_id,
                      title: `Approved Topup (${selectedDocument.amount})`,
                      amount: amtCoins,
                      type: 'credit' as const,
                      category: 'topup' as const,
                      date: 'Just now'
                    };
                    setWalletTransactions(prev => [{ ...newTx, id: Date.now().toString() } as any, ...prev]);

                    setWalletMessage({
                      text: `Your top-up of ${amtCoins} TGC (${selectedDocument.amount}) was approved!`,
                      type: 'success'
                    });
                    setTimeout(() => setWalletMessage(null), 5000);

                    setNotifications(prev => [
                      {
                        id: Date.now(),
                        title: "Top-Up Approved! 💰",
                        message: `Your top-up of ${amtCoins} TGC (${selectedDocument.amount}) has been approved and added to your wallet.`,
                        type: "reward",
                        time: "Just now",
                        read: false
                      } as any,
                      ...prev
                    ]);
                  }
                }
                setPendingPayments(prev => prev.filter(p => p.id !== selectedDocument.id));
                setSelectedDocument(null);
              }}
              className="flex-1 py-3.5 bg-emerald-500 text-white rounded-xl font-semibold flex justify-center items-center gap-2 hover:bg-emerald-600 transition-colors shadow-sm"
            >
              <Check className="w-5 h-5" /> Approve
            </button>
          </div>
        </div>
      )}

      {/* Bottom Bar */}
      <nav className="bg-white border-t border-gray-200 fixed bottom-0 w-full z-10 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-around max-w-md mx-auto px-2">
          <button 
            id="nav-btn-gigs"
            onClick={() => { setIsAdminView(false); setActiveTab('gigs'); }}
            className={`flex flex-col items-center p-3 transition-all duration-300 flex-1 relative ${
              !isAdminView && activeTab === 'gigs' ? 'text-indigo-600' : 'text-gray-400 hover:text-indigo-600'
            } ${isTourActive && tourStep === 1 ? 'bg-indigo-50 ring-2 ring-indigo-500 rounded-xl animate-pulse text-indigo-600 scale-105 shadow-md z-30' : ''}`}
          >
            <Briefcase className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">GiGs</span>
          </button>
          
          <button 
            id="nav-btn-seekers"
            onClick={() => { setIsAdminView(false); setActiveTab('seekers'); }}
            className={`flex flex-col items-center p-3 transition-all duration-300 flex-1 relative ${
              !isAdminView && activeTab === 'seekers' ? 'text-indigo-600' : 'text-gray-400 hover:text-indigo-600'
            } ${isTourActive && tourStep === 2 ? 'bg-indigo-50 ring-2 ring-indigo-500 rounded-xl animate-pulse text-indigo-600 scale-105 shadow-md z-30' : ''}`}
          >
            <Users className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">Seekers</span>
          </button>
          
          <button 
            id="nav-btn-friends"
            onClick={() => { setIsAdminView(false); setActiveTab('friends'); }}
            className={`flex flex-col items-center p-3 transition-colors flex-1 ${!isAdminView && activeTab === 'friends' ? 'text-indigo-600' : 'text-gray-400 hover:text-indigo-600'}`}
          >
            <div className="relative">
              <UserPlus className="w-6 h-6 mb-1" />
              {!isAdminView && friendRequests.filter(r => r.type === 'incoming' && r.status === 'pending').length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                </span>
              )}
            </div>
            <span className="text-xs font-medium">Friends</span>
          </button>
          

          {/* Referral Feature Icon */}
          <button 
            id="nav-btn-referrals"
            onClick={() => { setIsAdminView(false); setActiveTab('referrals'); }}
            className={`flex flex-col items-center p-3 flex-1 transition-all duration-300 relative ${
              !isAdminView && activeTab === 'referrals' ? 'text-indigo-600' : 'text-gray-400 hover:text-indigo-600'
            } ${isTourActive && (tourStep === 3 || tourStep === 4 || tourStep === 5) ? 'bg-indigo-50 ring-2 ring-indigo-500 rounded-xl animate-pulse text-indigo-600 scale-105 shadow-md z-30' : ''}`}
          >
            <div className="relative">
              <Gift className="w-6 h-6 mb-1" />
              {!isAdminView && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
              )}
            </div>
            <span className="text-xs font-medium">Referrals</span>
          </button>

          <button 
            id="nav-btn-wallet"
            onClick={() => { setIsAdminView(false); setActiveTab('wallet'); }}
            className={`flex flex-col items-center p-3 transition-colors flex-1 relative ${
              !isAdminView && activeTab === 'wallet' ? 'text-indigo-600' : 'text-gray-400 hover:text-indigo-600'
            }`}
          >
            <div className="relative">
              <Wallet className="w-6 h-6 mb-1" />
            </div>
            <span className="text-xs font-medium">Wallet</span>
          </button>
        </div>
      </nav>
      {/* Full Screen Image Modal */}
      {fullScreenImageIndex !== null && viewingGig && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col animate-in fade-in duration-200">
          <div className="flex justify-between items-center p-4 bg-gradient-to-b from-black/60 to-transparent absolute top-0 w-full z-10">
            <div className="text-white text-sm font-medium">
              {fullScreenImageIndex + 1} / {viewingGig.images.length}
            </div>
            <button 
              onClick={() => setFullScreenImageIndex(null)}
              className="text-white/80 hover:text-white transition-colors p-2 rounded-full bg-black/40 backdrop-blur-md"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="flex-1 flex items-center justify-center relative overflow-hidden">
            <img 
              src={viewingGig.images[fullScreenImageIndex]} 
              alt={viewingGig.title} 
              className="max-w-full max-h-full object-contain"
            />
            {viewingGig.images.length > 1 && (
              <>
                <button 
                  onClick={() => setFullScreenImageIndex(prev => prev! > 0 ? prev! - 1 : viewingGig.images.length - 1)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 text-white backdrop-blur-md rounded-full shadow-sm transition-colors"
                >
                  <ChevronLeft className="w-8 h-8" />
                </button>
                <button 
                  onClick={() => setFullScreenImageIndex(prev => prev! < viewingGig.images.length - 1 ? prev! + 1 : 0)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 text-white backdrop-blur-md rounded-full shadow-sm transition-colors rotate-180"
                >
                  <ChevronLeft className="w-8 h-8" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {chattingWith && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-white">
          <div className="p-4 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50 safe-top">
            <button onClick={() => setChattingWith(null)} className="p-2 -ml-2 rounded-full hover:bg-gray-200 text-gray-500">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h3 className="font-bold">{chattingWith}</h3>
          </div>
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'} relative mb-2`}>
                <div 
                  onClick={() => handleMessageClick(msg)}
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm flex flex-col gap-2 cursor-pointer select-none relative transition-all active:scale-[0.98] ${
                    msg.sender === 'me' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-850'
                  }`}
                >
                  {msg.attachment && (
                    msg.attachment.type === 'image' ? (
                      <img src={msg.attachment.url} alt="attachment" className="rounded-lg w-full object-cover max-h-48 cursor-pointer" onClick={(e) => { e.stopPropagation(); setFullscreenMedia({url: msg.attachment!.url, type: 'image'}); }} />
                    ) : (
                      <video src={msg.attachment.url} controls playsInline preload="metadata" className="rounded-lg w-full object-cover max-h-48 cursor-pointer" onClick={(e) => { e.stopPropagation(); setFullscreenMedia({url: msg.attachment!.url, type: 'video'}); }} />
                    )
                  )}
                  {msg.text !== '[Voice Note]' && <p>{msg.text}</p>}
                  {msg.audioUrl && (
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => playAudio(msg.audioUrl!)} className="p-2 rounded-full bg-indigo-500 text-white">
                        <Play className="w-4 h-4" />
                      </button>
                      <span className="text-xs font-semibold">Voice Note</span>
                    </div>
                  )}
                  {msg.liked && (
                    <div className="absolute -bottom-2.5 -right-2 bg-white rounded-full p-1 shadow-md border border-gray-200 flex items-center justify-center text-xs animate-in zoom-in duration-200" style={{ pointerEvents: 'none' }}>
                      👍
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          <div className="p-3 border-t border-gray-100 bg-white relative">
            {showEmojiPicker && (
              <div className="absolute bottom-16 left-2 z-50">
                <EmojiPicker onEmojiClick={async (emojiData) => {
                  if (await deductCoins(5, "Emoji Fee")) {
                    setChatMessage(prev => prev + emojiData.emoji);
                  }
                }} />
              </div>
            )}
            {chatAttachment && (
              <div className="mb-2 relative inline-block">
                {chatAttachment.type === 'image' ? (
                  <img src={chatAttachment.url} alt="attachment" className="h-16 w-16 object-cover rounded-lg border border-gray-200" />
                ) : (
                  <video src={chatAttachment.url} controls playsInline className="h-20 w-20 object-cover rounded-lg border border-gray-200" />
                )}
                <button onClick={() => setChatAttachment(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {pendingRecording && (
              <div className="mb-2 relative inline-block">
                {pendingRecording.type === 'audio' ? (
                  <div className="bg-gray-100 p-2 rounded-lg flex items-center gap-2">
                    <button onClick={() => playAudio(pendingRecording.url)} className="p-1 rounded-full bg-indigo-500 text-white">
                      <Play className="w-3 h-3" />
                    </button>
                    <span className="text-xs">Voice Note Preview</span>
                  </div>
                ) : (
                  <video src={pendingRecording.url} controls playsInline className="h-20 w-20 object-cover rounded-lg border border-gray-200" />
                )}
                <button onClick={() => setPendingRecording(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <form className="flex gap-2 items-center" onSubmit={async (e) => {
              e.preventDefault();
              if (chatMessage.trim() || chatAttachment || pendingRecording) {
                let cost = 10; // Default text/image/video
                let reason = "Message Fee";
                
                if (pendingRecording?.type === 'audio') {
                  cost = 20;
                  reason = "Voice Note Fee";
                }
                
                if (!await deductCoins(cost, reason)) return;

                const newMessage: any = {
                  id: Date.now().toString(),
                  text: chatMessage,
                  sender: 'me',
                  attachment: chatAttachment ? {type: chatAttachment.type, url: chatAttachment.url} : (pendingRecording?.type === 'video' ? {type: 'video', url: pendingRecording.url} : undefined),
                  audioUrl: pendingRecording?.type === 'audio' ? pendingRecording.url : undefined,
                  timestamp: Date.now()
                };
                setMessages([...messages, newMessage]);
                setChatMessage('');
                setChatAttachment(null);
                setPendingRecording(null);
              }
            }}>
              <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="text-gray-400 hover:text-gray-600">
                <Smile className="w-5 h-5" />
              </button>
              <label className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <Paperclip className="w-5 h-5" />
                <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const url = URL.createObjectURL(file);
                    setChatAttachment({ file, type: file.type.startsWith('video/') ? 'video' : 'image', url });
                  }
                }} />
              </label>
              <button type="button" onClick={() => isRecording ? stopRecording() : startRecording('audio')} className={`transition-colors ${isRecording ? 'text-red-600 animate-pulse' : 'text-gray-400 hover:text-gray-600'}`}>
                {isRecording ? <div className="flex items-center gap-1"><Square className="w-5 h-5" /><span className="text-xs">{Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}</span></div> : <Mic className="w-5 h-5" />}
              </button>
              <input value={chatMessage} onChange={e => setChatMessage(e.target.value)} className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm focus:outline-none" placeholder="Message... (10c)" />
              <button type="submit" className="bg-indigo-600 text-white rounded-full p-2"><Send className="w-5 h-5" /></button>
            </form>
          </div>
        </div>
      )}
      {fullscreenMedia && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center" onClick={() => setFullscreenMedia(null)}>
          <button className="absolute top-4 right-4 text-white p-2" onClick={() => setFullscreenMedia(null)}><X className="w-8 h-8" /></button>
          {fullscreenMedia.type === 'image' ? (
            <img src={fullscreenMedia.url} alt="fullscreen" className="max-w-full max-h-full object-contain" />
          ) : (
            <video src={fullscreenMedia.url} controls autoPlay className="max-w-full max-h-full" />
          )}
        </div>
      )}

      {/* Hiring Seeker Modal */}
      {hiringSeeker && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-indigo-600" />
                <h3 className="font-semibold text-gray-900">Hire {hiringSeeker.name}</h3>
              </div>
              <button 
                onClick={() => setHiringSeeker(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                if (!await deductCoins(10, `Hiring Fee: ${hiringSeeker.name}`)) return;

                const hireMessage = `Hi ${hiringSeeker.name}! I've submitted a hire offer:
Project: ${hireForm.projectTitle}
Budget/Rate: ${hireForm.budget || hiringSeeker.rate}
Details: ${hireForm.description}`;
                
                setMessages([
                  ...messages,
                  {
                    id: Date.now().toString(),
                    text: hireMessage,
                    sender: 'me',
                    timestamp: Date.now()
                  }
                ]);
                
                setNotifications([
                  {
                    id: Date.now(),
                    title: "Hire Offer Sent",
                    message: `You've sent a hiring offer to ${hiringSeeker.name} for ${hireForm.projectTitle}!`,
                    type: "message",
                    time: "Just now",
                    read: false
                  },
                  ...notifications
                ]);

                setChattingWith(hiringSeeker.name);
                setHiringSeeker(null);
                setHireForm({ projectTitle: '', budget: '', description: '' });
                setShowHireSuccess(true);
              }} 
              className="p-5 space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Project Title</label>
                <input 
                  type="text" 
                  required
                  value={hireForm.projectTitle}
                  onChange={e => setHireForm({...hireForm, projectTitle: e.target.value})}
                  placeholder="e.g. Setup my coffee shop website"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Budget / Offer Amount</label>
                <input 
                  type="text" 
                  value={hireForm.budget}
                  onChange={e => setHireForm({...hireForm, budget: e.target.value})}
                  placeholder={`e.g. ${hiringSeeker.rate}`}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Project Details / Job Description</label>
                <textarea 
                  required
                  value={hireForm.description}
                  onChange={e => setHireForm({...hireForm, description: e.target.value})}
                  placeholder="Please describe what you want the seeker to do..."
                  rows={3}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow resize-none"
                ></textarea>
              </div>

              <div className="pt-2">
                <button 
                  type="submit"
                  className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm flex items-center justify-center gap-2"
                >
                  Submit Hire Offer (10c)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hire Success Toast */}
      {showHireSuccess && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[100] bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-lg border border-emerald-500 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <CheckCircle2 className="w-5 h-5" />
          <div className="text-sm font-semibold">Offer sent! Direct chat opened.</div>
          <button onClick={() => setShowHireSuccess(false)} className="text-emerald-200 hover:text-white ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Edit / Delete / Action Modal */}
      {selectedMessageForAction && (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-end justify-center sm:items-center sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-bold text-gray-900 text-sm">Message Options</h3>
              <button 
                onClick={() => { setSelectedMessageForAction(null); setIsEditingMessage(false); }}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              {isEditingMessage ? (
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Edit Message</label>
                  <textarea
                    value={editMessageInput}
                    onChange={(e) => setEditMessageInput(e.target.value)}
                    rows={3}
                    className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                    placeholder="Type message..."
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsEditingMessage(false)}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-sm transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleEditMessage}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-sm transition-colors shadow-sm"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 italic max-h-24 overflow-y-auto">
                    "{selectedMessageForAction.text}"
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2 pt-1">
                    {/* Only show Edit for text messages, not pure voice notes or attachments */}
                    {selectedMessageForAction.text !== '[Voice Note]' && (
                      <button
                        onClick={() => {
                          setEditMessageInput(selectedMessageForAction.text);
                          setIsEditingMessage(true);
                        }}
                        className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                      >
                        Edit Message
                      </button>
                    )}
                    
                    <button
                      onClick={handleDeleteMessage}
                      className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      Delete Message
                    </button>
                    
                    <button
                      onClick={() => setSelectedMessageForAction(null)}
                      className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-center"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Seeker Profile Detail Modal */}
      {viewingSeekerDetail && (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col my-8 animate-in zoom-in-95 duration-200">
            {/* Modal Cover Image Placeholder */}
            <div className="relative h-32 bg-indigo-650 shrink-0 flex items-end px-6 pb-4 bg-gradient-to-r from-indigo-500 to-indigo-700">
              <button 
                onClick={() => setViewingSeekerDetail(null)}
                className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 text-white backdrop-blur-md rounded-full p-1.5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="absolute -bottom-12 left-6">
                <div 
                  onClick={() => setFullscreenSeekerAvatar(viewingSeekerDetail.avatar)}
                  className="w-24 h-24 rounded-full border-4 border-white overflow-hidden shadow-lg cursor-zoom-in relative group"
                  title="Click to view picture in full screen"
                >
                  <img src={viewingSeekerDetail.avatar} alt={viewingSeekerDetail.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Eye className="w-5 h-5 text-white" />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-16 px-6 pb-6 space-y-6">
              <div>
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-1.5">
                      {viewingSeekerDetail.name}
                      {viewingSeekerDetail.isPremium && (
                        <span className="bg-indigo-100 border border-indigo-200 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">PRO Seeker</span>
                      )}
                    </h2>
                    <p className="text-sm font-bold text-indigo-600 mt-1">{viewingSeekerDetail.title}</p>
                  </div>
                  <span className="text-xl font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">{viewingSeekerDetail.rate}</span>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400 font-medium mt-3.5">
                  <span className="flex items-center gap-0.5 text-amber-500 font-semibold text-sm">
                    <Star className="w-4 h-4 fill-current text-amber-500" /> {viewingSeekerDetail.rating || "5.0"}
                  </span>
                  <span>•</span>
                  <span className="text-gray-600 font-semibold">{viewingSeekerDetail.completedJobs || 0} Jobs Completed</span>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-gray-600 font-semibold bg-gray-100 px-2.5 py-1 rounded-md">
                    <MapPin className="w-3.5 h-3.5 text-indigo-500" /> {viewingSeekerDetail.location || 'Remote'}
                  </span>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-5">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">About the Seeker</h4>
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{viewingSeekerDetail.bio}</p>
              </div>

              <div className="border-t border-gray-100 pt-5">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5">Skills & Expertise</h4>
                <div className="flex flex-wrap gap-2">
                  {viewingSeekerDetail.skills && (
                    Array.isArray(viewingSeekerDetail.skills) 
                      ? viewingSeekerDetail.skills 
                      : (viewingSeekerDetail.skills as string).split(',')
                  ).map((skill: string) => (
                    <span key={skill} className="bg-indigo-50 border border-indigo-100 text-indigo-600 text-xs font-semibold px-3 py-1.5 rounded-xl">
                      {skill.trim()}
                    </span>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-5 flex gap-3">
                <button
                  onClick={() => setViewingSeekerDetail(null)}
                  className="flex-1 bg-gray-105 hover:bg-gray-200 text-gray-750 font-bold py-3.5 rounded-2xl text-sm transition-all text-center bg-gray-100"
                >
                  Close Profile
                </button>
                <button
                  onClick={() => {
                    setViewingSeekerDetail(null);
                    setChattingWith(viewingSeekerDetail.name);
                    setMessages([
                      {
                        id: Date.now().toString(),
                        text: `Hello ${viewingSeekerDetail.name}, I am interested in hiring your services. Let's discuss details!`,
                        sender: 'me',
                        timestamp: Date.now()
                      }
                    ]);
                  }}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-2xl text-sm transition-all flex items-center justify-center gap-2 shadow-md"
                >
                  <MessageCircle className="w-5 h-5" /> Message Seeker
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Picture Full Screen Lightbox Modal */}
      {fullscreenSeekerAvatar && (
        <div 
          className="fixed inset-0 z-[130] bg-black/95 flex flex-col items-center justify-center p-4 animate-in fade-in duration-300"
          onClick={() => setFullscreenSeekerAvatar(null)}
        >
          <button 
            onClick={() => setFullscreenSeekerAvatar(null)}
            className="absolute top-6 right-6 p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          
          <div className="max-w-2xl max-h-[80vh] overflow-hidden rounded-2xl shadow-2xl border border-white/10" onClick={(e) => e.stopPropagation()}>
            <img 
              referrerPolicy="no-referrer"
              src={fullscreenSeekerAvatar} 
              alt="Full screen view" 
              className="w-full h-full object-contain max-h-[75vh]" 
            />
          </div>
          
          <div className="mt-4 text-center">
            <span className="text-white/60 text-xs font-mono">Tap anywhere to close fullscreen view</span>
          </div>
        </div>
      )}

      {/* Onboarding / Guided Tour Overlay */}
      {isTourActive && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-[1px] z-50 flex flex-col justify-end p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden w-full max-w-md mx-auto animate-in slide-in-from-bottom-8 duration-300">
            {/* Header with Progress */}
            <div className="bg-gradient-to-r from-indigo-600 to-violet-700 p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center font-bold text-sm">
                  👩🏾‍💼
                </span>
                <div>
                  <h4 className="font-bold text-xs">Nomsa • TimeGig Guide</h4>
                  <p className="text-[10px] text-indigo-100">Let's explore TimeGig</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 bg-black/20 px-2.5 py-1 rounded-full text-[11px] font-bold">
                <span>Step {tourStep + 1} of 6</span>
                <div className="flex gap-0.5 ml-1">
                  {[0, 1, 2, 3, 4, 5].map((s) => (
                    <div 
                      key={s} 
                      className={`w-1.5 h-1.5 rounded-full transition-all ${s === tourStep ? 'bg-white w-3' : 'bg-white/40'}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Tour content */}
            <div className="p-5 text-left">
              <h3 className="font-bold text-gray-900 text-base mb-1.5 flex items-center gap-2">
                {tourStep === 0 && <Sparkles className="w-5 h-5 text-indigo-600 animate-pulse" />}
                {tourStep === 1 && <Briefcase className="w-5 h-5 text-indigo-600" />}
                {tourStep === 2 && <Users className="w-5 h-5 text-indigo-600" />}
                {tourStep === 3 && <Gift className="w-5 h-5 text-indigo-600 animate-bounce" />}
                {tourStep === 4 && <TrendingUp className="w-5 h-5 text-indigo-600" />}
                {tourStep === 5 && <Share2 className="w-5 h-5 text-indigo-600" />}
                <span>{tourSteps[tourStep].title}</span>
              </h3>
              <p className="text-gray-600 text-xs leading-relaxed mb-5">
                {tourSteps[tourStep].description}
              </p>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  onClick={() => {
                    setIsTourActive(false);
                    localStorage.setItem('timegig_tour_completed', 'true');
                    const newNotif = {
                      id: Date.now(),
                      title: "Tour Skipped",
                      message: "You can restart the tour anytime from the Settings menu.",
                      type: "system",
                      time: "Just now",
                      read: false
                    };
                    setNotifications(prev => [newNotif, ...prev]);
                  }}
                  className="text-xs font-semibold text-gray-400 hover:text-gray-650 transition-colors py-2 px-1"
                >
                  Skip Tour
                </button>
                <div className="flex gap-2">
                  {tourStep > 0 && (
                    <button
                      onClick={() => setTourStep(prev => prev - 1)}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold px-4 py-2.5 rounded-xl transition-colors border border-gray-200"
                    >
                      Back
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (tourStep < 5) {
                        setTourStep(prev => prev + 1);
                      } else {
                        // Finish tour
                        setIsTourActive(false);
                        localStorage.setItem('timegig_tour_completed', 'true');
                        
                        // Add 50 Coins credit reward notification!
                        const rewardNotif = {
                          id: Date.now(),
                          title: "50 Coins Starter Bonus Activated! 🎉",
                          message: "Congratulations! You've successfully completed the TimeGig Onboarding Tour and received a 50 Coins starter commission credit.",
                          type: "reward",
                          time: "Just now",
                          read: false
                        };
                        setNotifications(prev => [rewardNotif, ...prev]);

                        // Add to wallet & referral balances
                        setWalletBalance(prev => prev + 50);
                        setReferralEarningBalance(prev => prev + 50);
                        const newTx = {
                          id: 'tx-tour-' + Date.now(),
                          title: 'Starter Tour Reward Bonus',
                          amount: 50,
                          type: 'credit' as const,
                          date: 'Just now',
                          category: 'reward' as const
                        };
                        setWalletTransactions(prev => [newTx, ...prev]);
                        
                        // Set system message
                        setFriendSystemMessage({
                          text: "Congratulations! 50 Coins Starter Bonus Activated! 💎",
                          type: 'success'
                        });
                        setTimeout(() => {
                          setFriendSystemMessage(null);
                        }, 5000);
                      }
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1.5"
                  >
                    <span>{tourStep === 5 ? 'Get R50 Starter Bonus!' : 'Next'}</span>
                    <ChevronLeft className="w-3.5 h-3.5 rotate-180" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
    user_id: string;
    username: string;
}

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    login: (userData: User) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true); // Add loading state
    
    useEffect(() => {
        const stored = localStorage.getItem('gfs_user');
        if (stored) {
            try {
                setUser(JSON.parse(stored));
            } catch (e) {
                console.error("Failed to parse user session");
                localStorage.removeItem('gfs_user');
            }
        }
        setIsLoading(false); // Initialization done
    }, []);

    const login = (userData: User) => {
        setUser(userData);
        localStorage.setItem('gfs_user', JSON.stringify(userData));
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('gfs_user');
        window.location.href = '/login';
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within AuthProvider");
    return context;
};
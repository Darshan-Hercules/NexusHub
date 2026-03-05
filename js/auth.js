/**
 * auth.js – Authentication logic with Supabase
 */
const Auth = (() => {
    const validate = (fields) => {
        const errs = {};
        if (!fields.email || !fields.email.includes('@')) errs.email = 'Enter a valid email address.';
        if (!fields.password || fields.password.length < 6) errs.password = 'Password must be at least 6 characters.';
        if (fields.displayName !== undefined && (!fields.displayName || fields.displayName.length < 2)) errs.displayName = 'Name must be at least 2 characters.';
        if (fields.username !== undefined && (!fields.username || fields.username.length < 3)) errs.username = 'Username must be at least 3 characters.';
        return errs;
    };

    const register = async ({ displayName, username, email, password }) => {
        const errs = validate({ displayName, username, email, password });
        if (Object.keys(errs).length) return { success: false, errors: errs };

        // 1. Sign up with Supabase Auth
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    display_name: displayName,
                    username: username
                }
            }
        });

        if (error) {
            if (error.message.includes('rate limit')) {
                return { success: false, errors: { email: 'Email rate limit exceeded. Please disable "Confirm Email" in your Supabase Auth settings.' } };
            }
            return { success: false, errors: { email: error.message } };
        }

        // 2. Create profile entry (Supabase triggers or manual here)
        // Note: If you have a trigger on auth.users -> profiles, this isn't needed.
        // For simplicity, we'll do it manually here if the profile wasn't created.
        if (data.user) {
            const { error: profileError } = await supabase
                .from('profiles')
                .insert([{
                    id: data.user.id,
                    username,
                    display_name: displayName,
                    email: email,
                    color: Store.users.avatarColor(displayName)
                }]);

            if (profileError && !profileError.message.includes('duplicate')) {
                console.error('Profile creation error:', profileError);
            }
        }

        return { success: true, user: data.user };
    };

    const login = async ({ email, password }) => {
        const errs = validate({ email, password });
        if (Object.keys(errs).length) return { success: false, errors: errs };

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            console.error('Auth: Login error details:', error);
            if (error.message.includes('Email not confirmed')) {
                return { success: false, errors: { email: 'Email not confirmed. Please check your inbox or disable "Confirm Email" in Supabase settings.' } };
            }
            if (error.message.includes('Invalid login credentials')) {
                return { success: false, errors: { email: 'Incorrect email or password. Please try again.' } };
            }
            return { success: false, errors: { email: error.message } };
        }

        // Fetch/Sync profile
        const profile = await ensureProfile(data.user);

        // Set simple session for UI state (App.js uses this)
        const sessionUser = { ...data.user, ...profile };
        Store.session.set(sessionUser);

        return { success: true, user: sessionUser };
    };

    const logout = async () => {
        // Clear local state immediately for responsiveness
        Store.session.clear();
        App.navigate('login');

        // Attempt Supabase sign out in the background
        try {
            const timeout = new Promise((_, reject) => setTimeout(() => reject('SignOut timeout'), 2000));
            await Promise.race([supabase.auth.signOut(), timeout]);
        } catch (e) {
            console.warn('Auth: Background signout failed or timed out', e);
        }
    };

    const current = () => Store.session.get();

    const ensureProfile = async (authUser) => {
        const syncTask = (async () => {
            try {
                let { data: profile, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', authUser.id)
                    .single();

                if (!profile || error) {
                    console.warn('Auth: Profile missing, creating...', authUser.id);
                    const profileData = {
                        id: authUser.id,
                        username: authUser.user_metadata?.username || authUser.email.split('@')[0],
                        display_name: authUser.user_metadata?.display_name || authUser.email.split('@')[0],
                        email: authUser.email,
                        color: Store.users.avatarColor(authUser.user_metadata?.display_name || authUser.email)
                    };

                    // Try full insert
                    const { data: newProfile, error: insErr } = await supabase
                        .from('profiles')
                        .insert([profileData])
                        .select()
                        .single();

                    if (insErr) {
                        console.warn('Auth: Full profile insert failed, retrying without email column...', insErr.message);
                        // Fallback: retry without email column if it doesn't exist in DB yet
                        delete profileData.email;
                        const { data: retryProfile, error: retryErr } = await supabase
                            .from('profiles')
                            .insert([profileData])
                            .select()
                            .single();

                        if (retryErr) throw retryErr;
                        profile = retryProfile;
                    } else {
                        profile = newProfile;
                    }
                }
                return profile;
            } catch (e) {
                console.error('Auth: Profile sync error:', e);
                return null;
            }
        })();

        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Profile sync timed out')), 5000));

        try {
            return await Promise.race([syncTask, timeout]);
        } catch (e) {
            console.warn('Auth: Profile sync failed or timed out, using fallback.', e);
            return {
                id: authUser.id,
                username: authUser.user_metadata?.username || authUser.email.split('@')[0],
                display_name: authUser.user_metadata?.display_name || authUser.email.split('@')[0],
                email: authUser.email,
                color: '#7c6ff7'
            };
        }
    };

    const init = () => {
        // Listen for auth changes
        supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('Auth: onAuthStateChange event:', event, 'Session:', !!session);
            if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
                console.log('Auth: Restoring session for:', session.user.id);
                const profile = await ensureProfile(session.user);
                const sessionUser = { ...session.user, ...profile };
                Store.session.set(sessionUser);

                if (location.hash === '#/login' || location.hash === '' || location.hash === '#/') {
                    App.navigate('home');
                }
            } else if (event === 'SIGNED_OUT') {
                console.log('Auth: User signed out');
                Store.session.clear();
                if (location.hash !== '#/login') App.navigate('login');
            }
        });
    };

    return { register, login, logout, current, init };
})();

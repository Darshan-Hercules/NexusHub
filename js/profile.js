/**
 * profile.js – Profile management and dropdown menu
 */
const Profile = (() => {
    let isOpen = false;

    const toggle = () => {
        const panel = document.getElementById('profile-panel');
        if (!panel) return;

        isOpen = !isOpen;
        if (isOpen) {
            panel.classList.remove('hidden');
            document.addEventListener('click', handleOutsideClick);
        } else {
            panel.classList.add('hidden');
            document.removeEventListener('click', handleOutsideClick);
        }
    };

    const handleOutsideClick = (e) => {
        const panel = document.getElementById('profile-panel');
        const btn = document.querySelector('.header-profile-btn');
        if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
            toggle();
        }
    };

    const renderPanel = (user) => {
        const initials = Store.users.initials(user.display_name);
        return `
            <div id="profile-panel" class="profile-panel ${isOpen ? '' : 'hidden'} glass">
                <div class="profile-panel-header">
                    <div class="profile-preview-avatar" style="background:${user.color || '#7c6ff7'}">
                        ${user.avatar_url
                ? `<img src="${user.avatar_url}" alt="Profile" class="avatar-img">`
                : `<span class="avatar-initials">${initials}</span>`}
                    </div>
                    <h3 class="profile-display-name">${user.display_name}</h3>
                    <p class="profile-username">@${user.username}</p>
                </div>
                
                <div class="profile-panel-body">
                    <button class="btn btn-secondary btn-sm btn-block" onclick="Profile.changeAvatar()">
                        <span>Change Photo</span>
                    </button>
                    <button class="btn btn-secondary btn-sm btn-block" onclick="Profile.editProfile()">
                        <span>Edit Profile</span>
                    </button>
                    
                    <div class="panel-divider"></div>
                    
                    <button class="btn btn-ghost btn-danger btn-block logout-btn" onclick="Auth.logout()">
                        <span>Sign Out</span>
                        <span class="icon">🚪</span>
                    </button>
                </div>
            </div>
        `;
    };

    const updateAllAvatars = (url) => {
        const user = Auth.current();
        const initials = Store.users.initials(user?.display_name || '?');
        const avatars = document.querySelectorAll('.user-avatar-sm, .message-avatar, .task-card-assignee-avatar, .profile-preview-avatar');
        avatars.forEach(el => {
            el.innerHTML = `
                <img src="${url}" alt="Avatar" class="avatar-img" 
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                <span class="avatar-initials" style="display:none">${initials}</span>`;
            el.style.border = '1px solid var(--accent-cyan)';
        });
    };

    const changeAvatar = () => {
        const input = document.getElementById('avatar-input');
        if (input) input.click();
    };

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // 1. Instant Preview in Panel
        const reader = new FileReader();
        reader.onload = (event) => {
            const preview = document.querySelector('.profile-preview-avatar');
            if (preview) {
                preview.innerHTML = `<img src="${event.target.result}" alt="Preview">`;
                preview.style.border = '2px solid var(--accent-cyan)';
            }
        };
        reader.readAsDataURL(file);

        // 2. Upload to Storage
        await uploadAvatar(file);
    };

    const uploadAvatar = async (file) => {
        const user = Auth.current();
        if (!user) return;

        try {

            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}-${Math.random().toString(36).slice(2)}.${fileExt}`;
            const filePath = `${fileName}`;

            // Upload the file to the 'avatars' bucket
            const { error: uploadError, data } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // Get the public URL
            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            // 3. Update Profile in Database
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: publicUrl })
                .eq('id', user.id);

            if (updateError) throw updateError;

            // 4. Update Local Session
            const updatedUser = { ...user, avatar_url: publicUrl };
            Store.session.set(updatedUser);

            // 5. Reactive Update: Update all avatars on page immediately
            updateAllAvatars(publicUrl);

            console.log('Profile: Updated avatar URL to:', publicUrl);

            // 6. Global Sync & Re-render (using App.syncUser method)
            await App.syncUser();
        } catch (e) {
            console.error('Profile: Avatar upload error detail:', e);
            let msg = e.message || 'Unknown error';

            if (msg.includes('column "avatar_url"')) {
            } else if (msg.includes('bucket not found') || msg.includes('Bucket not found')) {
            } else {
            }
        }
    };

    const editProfile = async () => {
        const user = Auth.current();
        const newName = prompt('Enter your new display name:', user.display_name);
        if (newName && newName !== user.display_name) {
            try {
                const { error } = await supabase
                    .from('profiles')
                    .update({ display_name: newName })
                    .eq('id', user.id);

                if (error) throw error;

                // Update local session
                const updatedUser = { ...user, display_name: newName };
                Store.session.set(updatedUser);

                // Re-navigate to current view to refresh header
                window.dispatchEvent(new HashChangeEvent('hashchange'));
            } catch (e) {
                console.error('Profile: Update name error:', e);
            }
        }
    };

    return { toggle, renderPanel, changeAvatar, handleFileSelect, editProfile };
})();

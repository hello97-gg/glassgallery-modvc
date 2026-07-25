import type { ImageMeta, Notification, ProfileUser, Comment } from '../types';
import type { User } from 'firebase/auth';

export const PAGE_SIZE = 8;
export const CACHE_TIME_MS = 1000 * 60 * 5; // 5 minutes

// Compatibility helper to mimic Firestore's Timestamp object
// This avoids breaking frontend UI components that call .toDate() on dates.
const mapTimestamp = (timestampString: any) => {
    const date = timestampString ? new Date(timestampString) : new Date();
    return {
        toDate: () => date,
        seconds: Math.floor(date.getTime() / 1000),
        nanoseconds: (date.getTime() % 1000) * 1e6,
    } as any;
};

// Generates a random alphanumeric ID for local image addition
const generateImageId = () => {
    return 'img_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export const addImageToFirestore = async (
    user: User, 
    imageUrl: string, 
    title: string,
    description: string,
    license: string, 
    flags: string[], 
    originalWorkUrl?: string,
    licenseUrl?: string,
    location?: string
) => {
    try {
        const id = generateImageId();
        const response = await fetch('/api/images?action=upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id,
                imageUrl,
                uploaderUid: user.uid,
                uploaderName: user.displayName || 'Anonymous',
                uploaderPhotoURL: user.photoURL || '',
                title: title || '',
                description: description || '',
                license,
                licenseUrl: licenseUrl || '',
                flags,
                originalWorkUrl: originalWorkUrl || '',
                location: location || '',
            })
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || "Failed to upload image.");
        }
    } catch (error) {
        console.error("Error adding document: ", error);
        throw error;
    }
};

export const getImagesFromFirestore = async (): Promise<{ images: ImageMeta[] }> => {
    try {
        const response = await fetch('/api/images');
        if (!response.ok) {
            throw new Error(`Server returned status ${response.status}`);
        }
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('API endpoint returned HTML instead of JSON. Access via port 8788 or verify dev proxy.');
        }
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || "Failed to fetch images.");
        }

        const images = data.images.map((item: any) => ({
            ...item,
            uploadedAt: mapTimestamp(item.uploadedAt)
        })) as ImageMeta[];

        return { images };
    } catch (error) {
        console.error("Error getting documents: ", error);
        throw error;
    }
};

// Fetch personalized feed sorted by user's taste profile (uploads, likes, views, follows, aiConcepts, search intent)
export const getPersonalizedFeed = async (userUid: string): Promise<{ images: ImageMeta[], personalized: boolean }> => {
    try {
        // Read client-side search interests and send to server for taste matching
        let searchTerms = '';
        try {
            const interests = JSON.parse(localStorage.getItem('gg_user_interests') || '{}');
            searchTerms = Object.keys(interests).slice(0, 10).join(','); // Top 10 search interests
        } catch {}

        const url = `/api/images?action=personalized_feed&userUid=${userUid}${searchTerms ? `&searchTerms=${encodeURIComponent(searchTerms)}` : ''}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Server returned status ${response.status}`);
        }
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || "Failed to fetch personalized feed.");
        }

        const images = data.images.map((item: any) => ({
            ...item,
            uploadedAt: mapTimestamp(item.uploadedAt)
        })) as ImageMeta[];

        return { images, personalized: data.personalized || false };
    } catch (error) {
        console.error("Error getting personalized feed: ", error);
        throw error;
    }
};

// Record an image view for taste profile building (fire-and-forget)
export const recordImageView = async (imageId: string, userUid: string): Promise<void> => {
    try {
        await fetch('/api/images?action=view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageId: imageId.split('_loop_')[0], userUid })
        });
    } catch (error) {
        // Silent fail — view tracking is non-critical
    }
};

// Real-time subscription for the feed (simulated via client polling)
export const subscribeToImages = (callback: (images: ImageMeta[]) => void) => {
    let active = true;

    const poll = async () => {
        if (document.visibilityState !== 'visible') return;
        try {
            const { images } = await getImagesFromFirestore();
            if (active) {
                callback(images);
            }
        } catch (error) {
            console.error("Error in images polling:", error);
        }
    };

    poll();
    const interval = setInterval(poll, 60000); // Poll every 60 seconds when active

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            poll();
        }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
        active = false;
        clearInterval(interval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
};

// Real-time subscription for a single image (simulated via client polling)
export const subscribeToImage = (imageId: string, callback: (image: ImageMeta) => void) => {
    let active = true;
    const baseId = imageId ? imageId.split('_loop_')[0] : imageId;

    const poll = async () => {
        if (document.visibilityState !== 'visible') return;
        try {
            const response = await fetch(`/api/images?action=get_single&imageId=${baseId}`);
            if (!response.ok) {
                throw new Error(`Server returned status ${response.status}`);
            }
            const data = await response.json();
            if (active && data.success && data.image) {
                const img = {
                    ...data.image,
                    uploadedAt: mapTimestamp(data.image.uploadedAt)
                } as ImageMeta;
                callback(img);
            }
        } catch (error) {
            console.error("Error in image detail polling:", error);
        }
    };

    poll();
    const interval = setInterval(poll, 30000); // Poll every 30 seconds when active

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            poll();
        }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
        active = false;
        clearInterval(interval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
};

export const getImagesByUploader = async (uploaderUid: string): Promise<{ images: ImageMeta[] }> => {
    try {
        const response = await fetch(`/api/images?uploaderUid=${uploaderUid}`);
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || "Failed to fetch uploader images.");
        }

        const images = data.images.map((item: any) => ({
            ...item,
            uploadedAt: mapTimestamp(item.uploadedAt)
        })) as ImageMeta[];

        return { images };
    } catch (error) {
        console.error("Error getting user documents: ", error);
        throw error;
    }
};

export const updateImageDetails = async (imageId: string, updates: { title?: string; description?: string; license?: string; flags?: string[]; licenseUrl?: string; location?: string }) => {
    try {
        const response = await fetch('/api/images?action=update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageId, updates })
        });
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || "Failed to update image.");
        }
    } catch (error) {
        console.error("Error updating document: ", error);
        throw error;
    }
};

export const deleteImageFromFirestore = async (imageId: string) => {
    try {
        const response = await fetch('/api/images?action=delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageId })
        });
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || "Failed to delete image.");
        }
    } catch (error) {
        console.error("Error deleting document: ", error);
        throw error;
    }
};

export const incrementDownloadCount = async (imageId: string) => {
    try {
        await fetch('/api/images?action=download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageId })
        });
    } catch (error) {
        console.error("Error incrementing download count: ", error);
    }
};

export const toggleImageLike = async (image: ImageMeta, user: User) => {
    try {
        const response = await fetch('/api/images?action=like', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageId: image.id,
                userUid: user.uid,
                userName: user.displayName || 'Someone',
                userPhotoURL: user.photoURL || '',
            })
        });
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || "Failed to toggle like.");
        }
    } catch (error) {
        console.error("Error toggling image like: ", error);
        throw error;
    }
};

export const getNotificationsForUser = (userId: string, callback: (notifications: Notification[]) => void): (() => void) => {
    let active = true;

    const poll = async () => {
        if (document.visibilityState !== 'visible') return;
        try {
            const response = await fetch(`/api/notifications?userId=${userId}`);
            const data = await response.json();
            if (active && data.success) {
                const notifications = data.notifications.map((item: any) => ({
                    ...item,
                    createdAt: mapTimestamp(item.createdAt)
                })) as Notification[];
                callback(notifications);
            }
        } catch (error) {
            console.error("Error polling notifications:", error);
        }
    };

    poll();
    const interval = setInterval(poll, 45000); // Poll every 45 seconds when active

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            poll();
        }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
        active = false;
        clearInterval(interval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
};

export const markNotificationsAsRead = async (notificationIds: string[]) => {
    if (notificationIds.length === 0) return;
    try {
        const response = await fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notificationIds })
        });
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || "Failed to mark notifications as read.");
        }
    } catch (error) {
        console.error("Error marking notifications as read:", error);
    }
};

// --- User Profile Services ---

export const getUserProfile = async (uid: string): Promise<ProfileUser | null> => {
    try {
        const response = await fetch(`/api/users?uid=${uid}`);
        const data = await response.json();
        if (data.success && data.user) {
            return data.user as ProfileUser;
        }
        return null;
    } catch (error) {
        console.error("Error getting user profile:", error);
        return null;
    }
};

export const updateUserProfile = async (uid: string, data: Partial<ProfileUser>) => {
    try {
        // 1. Update Turso users table
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid, data })
        });
        const resData = await response.json();
        if (!resData.success) {
            throw new Error(resData.error || "Failed to update profile in database.");
        }
        
        // 2. Keep Firebase Auth profile update logic for compatibility
        // Wait, since we are imported 'auth' from firebase.ts, let's verify if we need it here.
        // Wait! In the old firestoreService.ts, it imported 'auth' from './firebase'.
        // Let's dynamically import it or use a global firebase auth check to keep it 100% robust.
        const { auth } = await import('./firebase');
        const user = auth.currentUser;
        if (user && user.uid === uid) {
             if (data.uploaderName || data.uploaderPhotoURL) {
                 await user.updateProfile({
                     displayName: data.uploaderName || user.displayName,
                     photoURL: data.uploaderPhotoURL || user.photoURL
                 });
             }
        }
    } catch (error) {
        console.error("Error updating user profile:", error);
        throw error;
    }
};

export const getFollowStats = async (uid: string, currentUserUid?: string): Promise<{ followersCount: number; followingCount: number; isFollowing: boolean }> => {
    try {
        const url = `/api/follows?action=stats&uid=${uid}${currentUserUid ? `&currentUserUid=${currentUserUid}` : ''}&t=${Date.now()}`;
        const response = await fetch(url, { cache: 'no-store' });
        const data = await response.json();
        if (data.success) {
            return {
                followersCount: data.followersCount,
                followingCount: data.followingCount,
                isFollowing: data.isFollowing
            };
        }
        return { followersCount: 0, followingCount: 0, isFollowing: false };
    } catch (error) {
        console.error("Error getting follow stats:", error);
        return { followersCount: 0, followingCount: 0, isFollowing: false };
    }
};

export const getFollowersList = async (uid: string): Promise<ProfileUser[]> => {
    try {
        const response = await fetch(`/api/follows?action=followers&uid=${uid}`);
        const data = await response.json();
        if (data.success && data.list) {
            return data.list as ProfileUser[];
        }
        return [];
    } catch (error) {
        console.error("Error getting followers list:", error);
        return [];
    }
};

export const getFollowingList = async (uid: string): Promise<ProfileUser[]> => {
    try {
        const response = await fetch(`/api/follows?action=following&uid=${uid}`);
        const data = await response.json();
        if (data.success && data.list) {
            return data.list as ProfileUser[];
        }
        return [];
    } catch (error) {
        console.error("Error getting following list:", error);
        return [];
    }
};

export const toggleFollowUser = async (followerUid: string, followingUid: string, actorName?: string, actorPhotoURL?: string): Promise<{ isFollowing: boolean }> => {
    try {
        const response = await fetch('/api/follows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ followerUid, followingUid, actorName, actorPhotoURL })
        });
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || "Failed to toggle follow.");
        }
        return { isFollowing: data.isFollowing };
    } catch (error) {
        console.error("Error toggling follow:", error);
        throw error;
    }
};

// --- Comments & Replies Service API ---

export const getCommentsForImage = async (imageId: string): Promise<Comment[]> => {
    try {
        const baseId = imageId ? imageId.split('_loop_')[0] : imageId;
        const response = await fetch(`/api/comments?imageId=${baseId}`);
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || "Failed to fetch comments.");
        }
        return data.comments as Comment[];
    } catch (error) {
        console.error("Error getting comments for image: ", error);
        throw error;
    }
};

export const addCommentToImage = async (
    imageId: string,
    user: User,
    content: string,
    parentId?: string | null
): Promise<Comment> => {
    try {
        const baseId = imageId ? imageId.split('_loop_')[0] : imageId;
        const response = await fetch('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageId: baseId,
                userUid: user.uid,
                userName: user.displayName || 'Anonymous',
                userPhotoURL: user.photoURL || '',
                content,
                parentId: parentId || null
            })
        });
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || "Failed to post comment.");
        }
        return data.comment as Comment;
    } catch (error) {
        console.error("Error adding comment to image: ", error);
        throw error;
    }
};

export const editComment = async (commentId: string, userUid: string, content: string): Promise<void> => {
    try {
        const response = await fetch('/api/comments?action=edit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commentId, userUid, content })
        });
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || "Failed to edit comment.");
        }
    } catch (error) {
        console.error("Error editing comment:", error);
        throw error;
    }
};

export const toggleCommentLike = async (commentId: string, userUid: string): Promise<{ isLiked: boolean }> => {
    try {
        const response = await fetch('/api/comments?action=like', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commentId, userUid })
        });
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || "Failed to toggle comment like.");
        }
        return { isLiked: data.isLiked };
    } catch (error) {
        console.error("Error toggling comment like:", error);
        throw error;
    }
};


// Fix: Use Firebase v8 compatibility imports to resolve module errors for Timestamp.
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

export interface ImageMeta {
  id: string;
  imageUrl: string;
  uploaderUid: string;
  uploaderName: string;
  uploaderPhotoURL: string;
  title?: string;
  description?: string;
  license: string;
  licenseUrl?: string;
  flags: string[];
  originalWorkUrl?: string;
  uploadedAt: firebase.firestore.Timestamp;
  likeCount?: number;
  likedBy?: string[];
  downloadCount?: number;
  commentCount?: number;
  viewCount?: number;
  location?: string;
}

export interface License {
  value: string;
  label: string;
  url?: string;
}

export interface ProfileUser {
  uploaderUid: string;
  uploaderName: string;
  uploaderPhotoURL: string;
  backgroundImageURL?: string;
  location?: string;
  email?: string;
  bio?: string;
  onboarded?: boolean;
  followedTags?: string[];
  isVerified?: boolean;
}

export interface Notification {
  id: string;
  recipientUid: string;
  actorUid: string;
  actorName: string;
  actorPhotoURL: string;
  type: 'like' | 'follow' | 'flagged';
  imageId: string;
  imageUrl: string;
  createdAt: firebase.firestore.Timestamp;
  read: boolean;
}

export interface Comment {
  id: string;
  imageId: string;
  userUid: string;
  userName: string;
  userPhotoURL?: string;
  content: string;
  createdAt: string; // ISO date string
  parentId?: string | null;
  likeCount?: number;
  likedBy?: string[];
  replies?: Comment[]; // Derived tree replies for frontend rendering
}


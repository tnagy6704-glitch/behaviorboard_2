/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getDatabase } from "firebase/database";

// IDE ILLESZD BE A SAJÁT FIREBASE CONFIGODAT
const firebaseConfig = {
  apiKey: "AIzaSyCn48SBkOSyKvEhyIDgE5zRjqX8nk7c0NE",
  authDomain: "online-vasarloi-magatart-d093b.firebaseapp.com",
  databaseURL: "https://online-vasarloi-magatart-d093b-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "online-vasarloi-magatart-d093b",
  storageBucket: "online-vasarloi-magatart-d093b.firebasestorage.app",
  messagingSenderId: "766079981765",
  appId: "1:766079981765:web:bcf23ad311d814ae52b8ac"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const database = getDatabase(app);

export default app;

# Climbing Community Platform

A full-stack web application that helps climbers discover routes, log ascents, share beta videos, 
and connect with the climbing community. Built with a mobile-first design, the platform provides 
an interactive gym map where users can explore routes, contribute climbing beta, and track their progress over time.

---

## Features

**Interactive Gym Map**: 
- Browse climbing walls and routes through an intuitive visual interface.
- Select routes to view detailed information and community content.
  
**Climb Logging**: 
- Record completed climbs.
- Track climbing history and progress over time.

**Community Beta**: 
- Upload and view beta videos for individual routes.
- Share techniques and climbing sequences with other climbers.
  
**User Authentication**: 
- Secure sign up and login using Supabase Authentication.
- Personalized climbing history and uploaded content.

**Cloud Storage**: 
- Store beta videos and user-generated media using Supabase Storage.
- Secure access with Row-Level Security (RLS).

---

## Tech Stack

- **Frontend**: React, JavaScript, CSS, Vite
- **Backend**: Supabase, PostgreSQL Database, Authentication, Storage, Row-Level Security (RLS)
- **Deployment**: Vercel

---

## Architecture

<pre>
React Frontend 
      │ 
      ▼ 
Supabase 
├── Authentication 
├── PostgreSQL Database 
├── Storage (Videos) 
└── Row-Level Security 
      │ 
      ▼ 
Vercel Deployment
</pre>

## Screenshots
<img width="1179" height="2556" alt="image" src="https://github.com/user-attachments/assets/5ee32476-f1e4-4911-b5ad-da0db89ee08e" />
<img width="1179" height="2556" alt="image" src="https://github.com/user-attachments/assets/c140755b-df4b-42a3-86db-f34af9215495" />
<img width="1179" height="2556" alt="image" src="https://github.com/user-attachments/assets/2cccda90-7b44-44c4-91a0-9f9b618274be" />
<img width="1179" height="2556" alt="image" src="https://github.com/user-attachments/assets/7a9667f4-ea60-4190-9c51-f52982eda34c" />








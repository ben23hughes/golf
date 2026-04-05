# Golf Betting Web App — MVP Specification

## Project Goal

Build a mobile-first web app that allows golfers to:

- create a round
- add players
- choose betting games
- enter scores during the round
- automatically calculate winnings

Primary differentiator:
An **AI game builder** that converts natural language descriptions of betting games into structured rules.

Example:

User input:
"$5 Nassau with presses and $2 skins"

AI output:
Game configuration that the system can track automatically.

---

# Tech Stack

Frontend
- Next.js
- React
- TailwindCSS

Backend
- Next.js API routes

Database
- PostgreSQL (via Supabase)

Authentication
- Supabase Auth

AI
- OpenAI API

Hosting
- Vercel

---

# Core Features (MVP)

1. User Accounts
2. Create Round
3. Add Players
4. Enter Scores
5. Game Tracking
6. Live Leaderboard
7. Shareable Round Link
8. AI Game Builder
9. Saved Game Templates

---

# User Flow

## Sign Up

User signs up using:

- email
- Google login

User profile fields:

name  
email  
handicap (optional)  
GHIN number (optional)

---

# Round Creation

User presses:

Start Round

Inputs:

course_name  
date  
tee_box

Add players:

- existing users
- guest players

Example players:

Ben  
Mike  
Dave  
Chris

---

# Game Selection

Users can:

1. Choose preset games
2. Generate games using AI

Preset games:

- Skins
- Nassau
- Left Right
- Banker
- Vegas
- Wolf
- Sixes
- Quota
- Best Ball
- Match Play

Each game includes:

stake amount  
rules  
calculation logic

Example:

$5 Nassau  
$2 Skins

---

# AI Game Builder

Users type natural language game descriptions.

Example input:

"$5 Nassau with automatic presses and $2 skins"

Send to OpenAI API.

Prompt:

"Convert this golf betting game description into structured JSON rules."

Example response:

{
  "games": [
    {
      "type": "nassau",
      "stake": 5,
      "presses_allowed": true
    },
    {
      "type": "skins",
      "stake": 2
    }
  ]
}

Store structured rules in database.

Allow user to edit before saving.

Users can save configurations as templates.

Example:

Saturday Game  
Vegas Game  
Trip Game

---

# Round Gameplay

Users enter scores hole-by-hole.

Example input:

Hole 1

Ben: 4  
Mike: 5  
Dave: 4  
Chris: 6

System recalculates automatically.

Calculations include:

skins winners  
Nassau progress  
points  
total winnings

---

# Live Leaderboard

Display running totals.

Example:

Leaderboard

Ben +$12  
Mike -$7  
Dave -$3  
Chris -$2

Leaderboard updates after each hole.

---

# Round Share Links

Each round generates a public link.

Example:

/round/7421

Anyone with link can view:

scores  
bets  
leaderboard

---

# End of Round Settlement

Display final payouts.

Example:

Ben +$18  
Mike -$8  
Dave -$6  
Chris -$4

Optional future integration:

Venmo  
Cash App

---

# Database Models

## Users

id  
name  
email  
handicap  
ghin_number  
created_at

---

## Rounds

id  
course_name  
date  
created_by  
status

---

## Players

id  
round_id  
user_id (nullable for guests)  
name  
handicap

---

## Scores

id  
round_id  
player_id  
hole_number  
strokes

---

## Games

id  
round_id  
game_type  
stake  
rules_json

---

# AI Integration

Use OpenAI API.

Endpoint:

POST /api/generate-game

Input:

natural language game description

Example:

"$5 Nassau with presses and $2 skins"

Output:

structured JSON game configuration.

Steps:

1. Send description to OpenAI
2. Parse returned JSON
3. Store rules in database
4. Attach rules to round

---

# MVP Scope

Include:

accounts  
round creation  
players  
score entry  
skins calculation  
Nassau calculation  
live leaderboard  
AI game builder

Exclude:

GPS yardages  
swing tracking  
club analytics  
course maps

---

# UI Requirements

Mobile-first.

Primary screens:

1. Login
2. Dashboard
3. Create Round
4. Add Players
5. Choose Games
6. AI Game Builder
7. Scorecard
8. Leaderboard
9. Round Summary

Scorecard must allow **fast hole-by-hole entry**.

---

# Validation Goal

Release MVP quickly.

Test with:

- local golf groups
- weekly golf games
- golf trips

Key metric:

Do players prefer the app over writing bets on a scorecard?

---

# Future Features

Handicap integration (GHIN API)

League standings

Season leaderboards

Automatic payments

Golf trip mode

Tournament mode
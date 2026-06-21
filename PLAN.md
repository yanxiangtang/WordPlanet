# Word Planet / 单词星球

## LLM-Driven Vocabulary Learning Web App for Kids

---

# 1. Product Overview

## 1.1 Product Name

Chinese name:

```text
单词星球
```

English name:

```text
Word Planet
```

## 1.2 One-Line Description

```text
An AI-powered vocabulary adventure app where kids learn English words through stories, games, conversations, and personalized review.
```

## 1.3 Product Vision

Word Planet is a web application for children to learn English vocabulary in a playful and personalized way.

Instead of showing children a boring word list, the app creates a daily learning adventure. Children explore different word planets, meet word characters, listen to AI-generated stories, play mini games, and review words based on their own learning progress.

The LLM is not only used to generate content. It acts as a learning companion, story creator, quiz generator, memory coach, and parent-report assistant.

---

# 2. Target Users

## 2.1 Primary Users

Children aged 5–12 who are learning English vocabulary.

## 2.2 Secondary Users

Parents who want to help their children build a daily English learning habit.

## 2.3 Age Segments


| Age Group | Learning Style                             | Product Focus                    |
| --------- | ------------------------------------------ | -------------------------------- |
| 5–7      | Visual, audio, simple interaction          | Pictures, voice, simple games    |
| 8–10     | Stories, quizzes, repetition               | Story learning, spelling, review |
| 11–12    | Sentences, conversation, school vocabulary | AI dialogue, usage, tests        |

---

# 3. Core Product Concept

The child enters a virtual world called Word Planet.

Each planet represents a vocabulary topic.

Example planets:

```text
Fruit Planet
Animal Planet
Color Planet
School Planet
Food Planet
Action Planet
Weather Planet
Emotion Planet
Family Planet
Body Planet
```

Every day, the child completes a short mission.

Daily mission flow:

```text
1. Learn 3–5 new words
2. Listen to a short AI-generated story
3. Play a mini game
4. Review older words
5. Collect word characters or rewards
```

---

# 4. Recommended Product Names

## 4.1 Best Option

```text
Chinese: 单词星球
English: Word Planet
```

## 4.2 Why This Name Works

```text
1. Easy for children to understand
2. Easy for parents to trust
3. Supports a game-like world map
4. Can expand into planets, characters, stories, and missions
5. Works naturally in both Chinese and English
```

## 4.3 Alternative Names


| Chinese Name | English Name         | Style                |
| ------------ | -------------------- | -------------------- |
| 单词星球     | Word Planet          | Adventure, scalable  |
| 单词小精灵   | Word Sprites         | Cute, friendly       |
| 词宝乐园     | WordyLand            | Playful, childlike   |
| 小词探险家   | Little Word Explorer | Educational          |
| 咕噜背单词   | Gulu Words           | IP character brand   |
| 词力小火箭   | Word Rocket          | Progress, growth     |
| 单词碰碰岛   | WordPop Island       | Game-based           |
| 豆豆单词     | Doudou Words         | Cute, local-friendly |
| 小小词典家   | Mini Wordsmith       | Educational          |

---

# 5. MVP Scope

## 5.1 MVP Goal

Validate whether children enjoy learning vocabulary through AI-generated stories, games, and daily missions.

## 5.2 MVP Features

```text
1. Child profile setup
2. Daily word mission
3. AI-generated word explanation
4. AI-generated short story
5. Simple quiz game
6. Review system
7. Parent progress report
```

## 5.3 What Not To Build In MVP

Avoid building too much at the beginning.

Do not include these in the first version:

```text
1. Too many mini games
2. Complex avatar system
3. Full social features
4. Teacher management system
5. Mobile app
6. Payment system
7. Complex animation engine
8. Open-ended unrestricted AI chat
```

---

# 6. Full User Flow

## Step 1: Parent Opens the App

The parent visits the landing page.

Landing page should explain:

```text
1. What the app does
2. Why it helps children remember words
3. How AI is used safely
4. What parents can control
5. How daily learning works
```

Main call-to-action:

```text
Start Learning
```

---

## Step 2: Parent Creates a Child Profile

Parent enters basic information.

Profile fields:

```text
Child name or nickname
Child age
English level
Native language
Daily word count
Preferred topics
Learning goal
```

Example:

```text
Name: Momo
Age: 7
Level: Beginner
Native language: Chinese
Daily words: 5
Topics: Animals, Fruits, Colors
Goal: Basic vocabulary
```

---

## Step 3: System Creates a Daily Mission

The system chooses words based on:

```text
1. Child age
2. English level
3. Selected topic
4. Previous learning history
5. Words that need review
```

Example daily mission:

```text
Today’s Mission:
Explore Animal Planet and meet 5 new word friends.
```

Example words:

```text
cat
dog
bird
fish
rabbit
```

---

## Step 4: Child Starts the Mission

The child sees a friendly AI companion.

Example AI message:

```text
Hi Momo! Today we are going to Animal Planet.
Let’s meet five animal friends together!
```

The child clicks:

```text
Start Adventure
```

---

## Step 5: Word Card Learning

Each word appears as a large card.

Word card contains:

```text
1. English word
2. Chinese meaning
3. Picture or icon
4. Audio pronunciation
5. Simple example sentence
6. Memory tip
7. Button to repeat pronunciation
```

Example word card:

```text
Word: rabbit
Meaning: 兔子
Sound: /ˈræbɪt/
Example: The rabbit can jump.
Memory Tip: Rabbit has two long ears and loves to jump.
```

---

## Step 6: LLM Generates Child-Friendly Explanation

The LLM explains the word based on the child’s age and level.

Example input:

```json
{
  "word": "rabbit",
  "age": 7,
  "native_language": "Chinese",
  "level": "beginner"
}
```

Example output:

```json
{
  "meaning": "兔子",
  "simple_explanation": "A rabbit is a small animal with long ears.",
  "example_sentence": "The rabbit can jump.",
  "memory_tip": "Rabbit has long ears and likes carrots."
}
```

Displayed to child:

```text
rabbit means 兔子.
A rabbit is a small animal with long ears.
The rabbit can jump.
```

---

## Step 7: Child Learns 3–5 New Words

The app repeats the word-card flow for each word.

Recommended daily word count:

```text
Age 5–7: 3 words per day
Age 8–10: 5 words per day
Age 11–12: 5–8 words per day
```

The child should not feel overloaded.

---

## Step 8: AI Generates a Short Story

After learning the words, the app generates a short story using those words.

Example input:

```json
{
  "words": ["cat", "dog", "bird", "fish", "rabbit"],
  "age": 7,
  "level": "beginner",
  "topic": "animals",
  "native_language": "Chinese"
}
```

Example output:

```text
A rabbit goes to the forest.
It sees a cat.
The cat sees a dog.
The dog sees a bird.
The bird flies over a fish.
They are happy friends.
```

For Chinese-speaking beginners, the story can be mixed:

```text
一只 rabbit 去森林玩。
它遇到了一只 cat。
cat 又看到了一只 dog。
bird 在天上飞。
fish 在水里游。
```

---

## Step 9: Child Interacts With the Story

The child can interact with highlighted words.

Interactions:

```text
1. Click a word to hear pronunciation
2. Click a word to see meaning
3. Drag word to matching picture
4. Answer a simple question
5. Repeat a sentence after audio
```

Example question:

```text
Which animal can fly?

A. rabbit
B. bird
C. fish
```

Correct feedback:

```text
Great! A bird can fly.
```

Wrong feedback:

```text
Good try! Let’s look again. Bird means 小鸟. A bird can fly.
```

---

## Step 10: Mini Game

The child plays one simple game.

MVP game should be multiple choice.

Example:

```text
Question:
Which word means 兔子?

A. cat
B. rabbit
C. bird
```

Another example:

```text
Question:
Choose the word for 小狗.

A. dog
B. fish
C. apple
```

Game design rules:

```text
1. Use large buttons
2. Use friendly animation
3. Avoid harsh failure messages
4. Keep each game under 2 minutes
5. Give immediate feedback
```

---

## Step 11: Review Old Words

The app shows words that need review.

Review categories:

```text
New Friends
Old Friends
Tricky Friends
Star Words
```

Technical categories:

```text
1. Words learned today
2. Words learned yesterday
3. Words answered incorrectly
4. Words due for spaced review
5. Words close to mastery
```

Example review queue:

```text
apple
red
jump
happy
book
```

---

## Step 12: System Updates Word Progress

After each answer, the system updates the child’s word progress.

Data to track:

```text
1. Word ID
2. Number of times seen
3. Number of correct answers
4. Number of wrong answers
5. Last reviewed time
6. Next review time
7. Mastery level
8. Confusion words
```

Example mastery levels:

```text
0 = New
1 = Seen
2 = Remembered once
3 = Stable
4 = Mastered
```

---

## Step 13: AI Gives Encouragement

At the end of the mission, the AI companion gives feedback.

Example:

```text
Great job, Momo!
Today you met 5 animal words.
You remembered cat, dog, and bird very well.
Rabbit and fish are still a little tricky, so we will practice them again tomorrow.
```

Avoid saying:

```text
You failed.
You are wrong.
Your score is bad.
```

Use:

```text
Good try.
Let’s practice again.
This word is a tricky friend.
You are getting better.
```

---

## Step 14: Parent Receives Report

The parent dashboard shows a simple daily report.

Report includes:

```text
1. Words learned today
2. Correct answer rate
3. Words needing review
4. Learning time
5. Streak
6. AI recommendation
```

Example report:

```text
Today, your child learned 5 animal words.

Strong words:
cat
dog
bird

Needs review:
rabbit
fish

Recommendation:
Review rabbit and fish tomorrow with picture-based questions.
```

---

# 7. Main App Pages

## 7.1 Landing Page

Purpose:

```text
Explain the product to parents and encourage signup.
```

Sections:

```text
1. Hero section
2. Product benefits
3. How it works
4. Example lesson
5. AI safety explanation
6. Parent control section
7. Start button
```

---

## 7.2 Child Home Page

Purpose:

```text
Let the child quickly start today’s learning mission.
```

Elements:

```text
1. AI companion
2. Daily mission card
3. Learning streak
4. Start adventure button
5. Word planet map
6. Reward progress
```

---

## 7.3 Learning Page

Purpose:

```text
Teach new words through cards, audio, and simple examples.
```

Elements:

```text
1. Word card
2. Picture or animation
3. Audio pronunciation
4. AI explanation
5. Example sentence
6. Memory tip
7. Next button
```

---

## 7.4 Story Page

Purpose:

```text
Help the child understand words in context.
```

Elements:

```text
1. AI-generated story
2. Highlighted vocabulary
3. Click-to-hear words
4. Simple comprehension question
5. Continue button
```

---

## 7.5 Game Page

Purpose:

```text
Reinforce memory through simple interaction.
```

Elements:

```text
1. Quiz question
2. Large answer buttons
3. Image choices
4. Immediate feedback
5. Progress bar
```

---

## 7.6 Review Page

Purpose:

```text
Strengthen long-term memory.
```

Elements:

```text
1. Review queue
2. Difficult words
3. Mastered words
4. Retry button
5. Encouragement message
```

---

## 7.7 Word Collection Page

Purpose:

```text
Motivate children through collection.
```

Elements:

```text
1. Word characters
2. Topic categories
3. Mastered word badges
4. Locked future words
5. Planet progress
```

---

## 7.8 Parent Dashboard

Purpose:

```text
Help parents track progress and control learning settings.
```

Elements:

```text
1. Daily progress
2. Weekly report
3. Accuracy rate
4. Weak words
5. Learning time
6. Topic settings
7. Difficulty settings
8. Daily word count setting
```

---

# 8. LLM Feature Design

## 8.1 Word Explanation Generator

Purpose:

```text
Generate child-friendly word explanations.
```

Input:

```json
{
  "word": "apple",
  "age": 6,
  "native_language": "Chinese",
  "level": "beginner"
}
```

Output:

```json
{
  "meaning": "苹果",
  "simple_explanation": "An apple is a round fruit. It can be red, green, or yellow.",
  "example_sentence": "I eat an apple.",
  "memory_tip": "Apple starts with A."
}
```

---

## 8.2 Story Generator

Purpose:

```text
Generate short stories using target words.
```

Input:

```json
{
  "words": ["apple", "banana", "orange"],
  "age": 6,
  "level": "beginner",
  "topic": "fruits"
}
```

Output:

```json
{
  "title": "Fruit Picnic",
  "story": "Momo has an apple. Dodo has a banana. Kiki has an orange. They have a happy picnic.",
  "questions": [
    {
      "question": "Who has a banana?",
      "answer": "Dodo"
    }
  ]
}
```

---

## 8.3 Quiz Generator

Purpose:

```text
Generate practice questions.
```

Question types:

```text
1. Multiple choice
2. Meaning matching
3. Missing letter
4. Sentence completion
5. True or false
6. Picture choice
```

Example input:

```json
{
  "word": "apple",
  "meaning": "苹果",
  "age": 6,
  "quiz_type": "multiple_choice"
}
```

Example output:

```json
{
  "question": "Which word means 苹果?",
  "choices": ["apple", "dog", "blue"],
  "answer": "apple"
}
```

---

## 8.4 Mistake Analyzer

Purpose:

```text
Find patterns in the child’s mistakes.
```

Example input:

```json
{
  "wrong_words": ["ship", "sheep"],
  "age": 8,
  "native_language": "Chinese"
}
```

Example output:

```json
{
  "problem": "The child confuses similar-looking and similar-sounding words.",
  "explanation": "ship means 船. sheep means 羊.",
  "practice_activity": "Show two pictures and ask the child to choose the correct word."
}
```

---

## 8.5 Review Planner

Purpose:

```text
Decide which words should be reviewed next.
```

Factors:

```text
1. Last review time
2. Correct answer count
3. Wrong answer count
4. Word difficulty
5. Response speed
6. Similar confused words
```

Output example:

```json
{
  "review_today": ["rabbit", "fish", "yellow"],
  "new_words": ["tiger", "lion", "monkey"],
  "reason": "rabbit and fish were answered incorrectly yesterday."
}
```

---

## 8.6 AI Companion

Purpose:

```text
Make the learning experience friendly and emotional.
```

AI companion responsibilities:

```text
1. Welcome the child
2. Explain the mission
3. Encourage after answers
4. Give simple hints
5. Celebrate progress
6. Avoid negative pressure
```

Example companion messages:

```text
Great job!
Good try!
Let’s try one more time.
This word is a tricky friend.
You are getting better every day.
```

---

# 9. Safety Rules

## 9.1 LLM Output Safety

The AI should:

```text
1. Use age-appropriate language
2. Avoid scary content
3. Avoid violent content
4. Avoid adult topics
5. Avoid long explanations
6. Avoid open-ended unsafe conversations
7. Stay focused on learning
8. Never ask for private personal information
9. Never generate inappropriate examples
10. Never shame the child
```

---

## 9.2 Parent Controls

Parents should be able to:

```text
1. Set learning time
2. Choose vocabulary topics
3. Disable open chat
4. View learning reports
5. Adjust difficulty
6. Reset progress
7. Set daily word count
8. Control audio and microphone usage
```

---

## 9.3 LLM Guardrails

Use structured prompts and output validation.

Rules:

```text
1. Require JSON output for generated content
2. Validate all LLM output before showing it
3. Limit story length
4. Limit sentence complexity
5. Filter unsafe topics
6. Use fixed quiz schemas
7. Do not allow the child to freely ask unrelated questions in MVP
```

---

# 10. Gamification Design

## 10.1 Rewards

Children can earn:

```text
Stars
Word gems
Character cards
Planet badges
Mission medals
Word tree growth
```

---

## 10.2 Word Characters

Each learned word can become a collectible character.

Examples:

```text
apple = Apple Buddy
rabbit = Jumping Rabbit
sun = Sunny Friend
blue = Blue Bubble
happy = Happy Star
```

---

## 10.3 Progress System

Example:

```text
Learn 5 words -> unlock 1 word character
Complete 3 days -> unlock a new planet
Master 20 words -> earn a badge
Review old words -> grow your word tree
```

---

## 10.4 Streak System

Simple streak rewards:

```text
1 day: Small star
3 days: New sticker
7 days: New planet badge
14 days: New companion accessory
30 days: Super learner badge
```

---

# 11. Technical Architecture

## 11.1 Frontend

Recommended stack:

```text
Next.js
React
TypeScript
Tailwind CSS
Framer Motion
Web Speech API
```

Frontend responsibilities:

```text
1. Child learning interface
2. Parent dashboard
3. Word cards
4. Story display
5. Quiz game
6. Audio playback
7. Basic microphone input
```

---

## 11.2 Backend

Recommended stack options:

```text
Option A: Node.js + NestJS
Option B: Go + Gin/Fiber
Option C: Python + FastAPI
```

Backend responsibilities:

```text
1. User accounts
2. Child profiles
3. Word progress
4. LLM calls
5. Review scheduling
6. Parent reports
7. Content safety validation
```

---

## 11.3 Database

Recommended database:

```text
PostgreSQL
```

Optional cache:

```text
Redis
```

Core tables:

```text
users
children_profiles
word_lists
words
daily_sessions
word_progress
quiz_results
review_queue
parent_reports
llm_generated_content
```

---

## 11.4 LLM Services

LLM used for:

```text
1. Word explanations
2. Story generation
3. Quiz generation
4. Mistake analysis
5. Review suggestions
6. Parent report summaries
```

Do not use LLM for:

```text
1. Authentication
2. Payment
3. Core progress calculation
4. Unsafe open-ended child chat in MVP
```

---

## 11.5 Speech Features

MVP can start simple.

Phase 1:

```text
Use browser text-to-speech for word pronunciation.
```

Phase 2:

```text
Use speech recognition to let children read words aloud.
```

Phase 3:

```text
Use pronunciation scoring or speech model feedback.
```

---

# 12. Data Model Draft

## 12.1 users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## 12.2 children_profiles

```sql
CREATE TABLE children_profiles (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  nickname TEXT NOT NULL,
  age INT NOT NULL,
  native_language TEXT NOT NULL,
  english_level TEXT NOT NULL,
  daily_word_count INT NOT NULL DEFAULT 5,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## 12.3 words

```sql
CREATE TABLE words (
  id UUID PRIMARY KEY,
  word TEXT NOT NULL,
  meaning_zh TEXT,
  topic TEXT,
  difficulty_level INT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## 12.4 word_progress

```sql
CREATE TABLE word_progress (
  id UUID PRIMARY KEY,
  child_id UUID REFERENCES children_profiles(id),
  word_id UUID REFERENCES words(id),
  seen_count INT NOT NULL DEFAULT 0,
  correct_count INT NOT NULL DEFAULT 0,
  wrong_count INT NOT NULL DEFAULT 0,
  mastery_level INT NOT NULL DEFAULT 0,
  last_reviewed_at TIMESTAMP,
  next_review_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## 12.5 daily_sessions

```sql
CREATE TABLE daily_sessions (
  id UUID PRIMARY KEY,
  child_id UUID REFERENCES children_profiles(id),
  topic TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  total_words INT,
  correct_count INT,
  wrong_count INT
);
```

## 12.6 quiz_results

```sql
CREATE TABLE quiz_results (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES daily_sessions(id),
  child_id UUID REFERENCES children_profiles(id),
  word_id UUID REFERENCES words(id),
  question TEXT,
  selected_answer TEXT,
  correct_answer TEXT,
  is_correct BOOLEAN,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

# 13. API Draft

## 13.1 Create Child Profile

```http
POST /api/children
```

Request:

```json
{
  "nickname": "Momo",
  "age": 7,
  "native_language": "Chinese",
  "english_level": "beginner",
  "daily_word_count": 5
}
```

Response:

```json
{
  "child_id": "child_123",
  "nickname": "Momo"
}
```

---

## 13.2 Get Daily Mission

```http
GET /api/children/{child_id}/daily-mission
```

Response:

```json
{
  "mission_id": "mission_123",
  "topic": "Animals",
  "new_words": ["cat", "dog", "bird", "fish", "rabbit"],
  "review_words": ["apple", "red", "jump"]
}
```

---

## 13.3 Generate Word Explanation

```http
POST /api/llm/word-explanation
```

Request:

```json
{
  "child_id": "child_123",
  "word": "rabbit"
}
```

Response:

```json
{
  "word": "rabbit",
  "meaning": "兔子",
  "simple_explanation": "A rabbit is a small animal with long ears.",
  "example_sentence": "The rabbit can jump.",
  "memory_tip": "Rabbit has long ears and likes carrots."
}
```

---

## 13.4 Generate Story

```http
POST /api/llm/story
```

Request:

```json
{
  "child_id": "child_123",
  "words": ["cat", "dog", "bird", "fish", "rabbit"],
  "topic": "Animals"
}
```

Response:

```json
{
  "title": "Animal Friends",
  "story": "A rabbit goes to the forest. It sees a cat. The cat sees a dog. The dog sees a bird. The bird flies over a fish.",
  "questions": [
    {
      "question": "Which animal can fly?",
      "choices": ["rabbit", "bird", "fish"],
      "answer": "bird"
    }
  ]
}
```

---

## 13.5 Submit Quiz Answer

```http
POST /api/quiz/submit
```

Request:

```json
{
  "child_id": "child_123",
  "session_id": "session_123",
  "word": "rabbit",
  "question": "Which word means 兔子?",
  "selected_answer": "rabbit",
  "correct_answer": "rabbit"
}
```

Response:

```json
{
  "is_correct": true,
  "feedback": "Great job! Rabbit means 兔子.",
  "updated_mastery_level": 2
}
```

---

## 13.6 Get Parent Report

```http
GET /api/children/{child_id}/parent-report
```

Response:

```json
{
  "date": "2026-06-21",
  "words_learned": ["cat", "dog", "bird", "fish", "rabbit"],
  "strong_words": ["cat", "dog", "bird"],
  "weak_words": ["fish", "rabbit"],
  "accuracy": 0.8,
  "recommendation": "Review fish and rabbit tomorrow with picture-based questions."
}
```

---

# 14. LLM Prompt Templates

## 14.1 Word Explanation Prompt

```text
You are an English vocabulary teacher for children.

Generate a simple explanation for the word below.

Rules:
- Use age-appropriate language.
- Use short sentences.
- Use Chinese meaning if native_language is Chinese.
- Do not include scary, violent, adult, or unsafe content.
- Output valid JSON only.

Input:
word: {{word}}
age: {{age}}
native_language: {{native_language}}
english_level: {{english_level}}

Output JSON schema:
{
  "word": string,
  "meaning": string,
  "simple_explanation": string,
  "example_sentence": string,
  "memory_tip": string
}
```

---

## 14.2 Story Generation Prompt

```text
You are creating a short English learning story for a child.

Rules:
- Use all target words.
- Use simple sentences.
- Keep the story under {{max_words}} words.
- Make the story friendly and safe.
- Avoid scary, violent, adult, or unsafe content.
- Use beginner English.
- If the child is a beginner Chinese speaker, you may include simple Chinese support.
- Output valid JSON only.

Input:
target_words: {{target_words}}
age: {{age}}
english_level: {{english_level}}
native_language: {{native_language}}
topic: {{topic}}

Output JSON schema:
{
  "title": string,
  "story": string,
  "highlight_words": string[],
  "questions": [
    {
      "question": string,
      "choices": string[],
      "answer": string
    }
  ]
}
```

---

## 14.3 Quiz Generation Prompt

```text
You are creating a vocabulary quiz for a child.

Rules:
- Use simple language.
- Make only one correct answer.
- Choices should be easy to read.
- Avoid unsafe content.
- Output valid JSON only.

Input:
word: {{word}}
meaning: {{meaning}}
age: {{age}}
quiz_type: {{quiz_type}}
native_language: {{native_language}}

Output JSON schema:
{
  "question": string,
  "choices": string[],
  "answer": string,
  "feedback_correct": string,
  "feedback_wrong": string
}
```

---

## 14.4 Mistake Analysis Prompt

```text
You are a friendly vocabulary learning coach.

Analyze the child's wrong answers and suggest a simple practice activity.

Rules:
- Do not blame the child.
- Use encouraging language.
- Keep explanation short.
- Output valid JSON only.

Input:
wrong_words: {{wrong_words}}
confused_pairs: {{confused_pairs}}
age: {{age}}
native_language: {{native_language}}

Output JSON schema:
{
  "problem": string,
  "simple_explanation": string,
  "practice_activity": string,
  "encouraging_message": string
}
```

---

## 14.5 Parent Report Prompt

```text
You are writing a short learning report for a parent.

Rules:
- Be clear and concise.
- Mention progress.
- Mention weak words gently.
- Give one useful recommendation.
- Do not exaggerate.
- Output valid JSON only.

Input:
child_name: {{child_name}}
words_learned: {{words_learned}}
strong_words: {{strong_words}}
weak_words: {{weak_words}}
accuracy: {{accuracy}}
learning_time_minutes: {{learning_time_minutes}}

Output JSON schema:
{
  "summary": string,
  "strong_words": string[],
  "weak_words": string[],
  "recommendation": string
}
```

---

# 15. Development Roadmap

## Phase 1: Prototype

Goal:

```text
Build a simple playable demo.
```

Features:

```text
1. Child profile
2. Daily 5-word lesson
3. AI-generated explanation
4. AI-generated story
5. Multiple-choice quiz
6. Basic progress tracking
```

Estimated result:

```text
A child can complete one full daily lesson from start to finish.
```

---

## Phase 2: MVP

Goal:

```text
Make the product usable by real families.
```

Features:

```text
1. Parent dashboard
2. Review system
3. Word collection
4. Topic selection
5. Better UI animations
6. Safer LLM output validation
7. Basic speech playback
```

Estimated result:

```text
Parents can create a profile, children can learn daily, and progress is saved.
```

---

## Phase 3: Beta

Goal:

```text
Improve retention and learning quality.
```

Features:

```text
1. Pronunciation practice
2. Personalized review schedule
3. Weekly reports
4. More mini games
5. AI companion personality
6. More vocabulary sets
```

Estimated result:

```text
The app becomes more adaptive and engaging.
```

---

## Phase 4: Full Product

Goal:

```text
Build a scalable learning platform.
```

Features:

```text
1. School vocabulary import
2. Multi-child family accounts
3. Teacher mode
4. Custom word lists
5. Advanced analytics
6. Mobile app
7. Subscription system
```

Estimated result:

```text
The app can support families, teachers, and long-term learning.
```

---

# 16. MVP Build Steps

## Step 1: Build Static UI

Pages:

```text
Landing page
Child home page
Learning page
Story page
Quiz page
Review page
Parent dashboard
```

---

## Step 2: Add Child Profile

Implement:

```text
Create child profile
Edit child profile
Store age, level, native language, daily word count
```

---

## Step 3: Add Word List

Start with fixed vocabulary topics.

Example topics:

```text
Animals
Fruits
Colors
Actions
School
Food
Weather
Family
Body
Emotions
```

---

## Step 4: Generate Daily Mission

Create a function that selects:

```text
3–5 new words
2–5 review words
1 topic
1 mission title
```

---

## Step 5: Add LLM Word Explanation

Create backend endpoint:

```text
POST /api/llm/word-explanation
```

Use structured JSON output.

Cache the result to avoid repeated LLM calls.

---

## Step 6: Add LLM Story Generation

Create backend endpoint:

```text
POST /api/llm/story
```

Use target words and child profile.

Validate output before displaying.

---

## Step 7: Add Quiz Game

Start with multiple choice only.

Quiz types for MVP:

```text
Word to meaning
Meaning to word
Word to picture
```

---

## Step 8: Track Results

Save every quiz answer.

Track:

```text
Correct answer
Wrong answer
Word progress
Session progress
Mastery level
```

---

## Step 9: Add Review Logic

Simple review algorithm:

```text
If word is wrong, review tomorrow.
If word is correct once, review in 2 days.
If word is correct twice, review in 4 days.
If word is correct three times, mark as stable.
If word is correct five times, mark as mastered.
```

---

## Step 10: Add Parent Report

Generate report from session data.

Start without LLM:

```text
Words learned
Accuracy
Weak words
Learning time
```

Then add LLM summary later.

---

## Step 11: Add Safety Validation

Before showing LLM content:

```text
1. Check JSON schema
2. Check story length
3. Check required words are included
4. Check unsafe keywords
5. Check sentence length
6. Regenerate if invalid
```

---

## Step 12: Test With Real Children

Observe:

```text
1. Do children understand the flow?
2. Do they enjoy the story?
3. Do they finish the lesson?
4. Which words do they remember?
5. Where do they get stuck?
6. Do parents understand the report?
```

---

# 17. Success Metrics

## 17.1 Learning Metrics

```text
Words learned per week
Review accuracy
Weak word improvement
Retention after 3 days
Retention after 7 days
Mastered words count
```

---

## 17.2 Engagement Metrics

```text
Daily active users
Average session length
Mission completion rate
Learning streak length
Return rate
Game completion rate
```

---

## 17.3 Parent Metrics

```text
Parent dashboard visits
Report open rate
Vocabulary settings usage
Daily word count adjustment
Subscription conversion
```

---

# 18. Example Daily Lesson

## Topic

```text
Animals
```

## Age

```text
7
```

## Level

```text
Beginner
```

## New Words

```text
cat
dog
bird
fish
rabbit
```

## Story

```text
A cat sees a dog.
The dog sees a bird.
The bird flies over a fish.
A rabbit jumps and says hello.
They are happy friends.
```

## Quiz

```text
Question:
Which word means 小鸟?

A. cat
B. bird
C. fish

Answer:
B. bird
```

## Review Words

```text
apple
red
jump
happy
book
```

## Parent Report

```text
Today, your child learned 5 animal words.

Strong words:
cat
dog
bird

Needs review:
fish
rabbit

Recommendation:
Review fish and rabbit tomorrow with picture-based questions.
```

---

# 19. Key Design Principles

```text
1. Make learning feel like play.
2. Keep each session short.
3. Use images, sound, and stories.
4. Avoid pressure and negative scoring.
5. Give immediate encouragement.
6. Personalize explanations by age.
7. Let parents control learning goals.
8. Use LLM for flexibility, not randomness.
9. Validate AI output before showing it to children.
10. Build learning habit before adding complexity.
```

---

# 20. Final Recommendation

Build the first version as:

```text
A web app where a child learns 5 words per day through an AI-generated story and a simple quiz.
```

The first version should include:

```text
1. Word card
2. AI explanation
3. AI story
4. Multiple-choice quiz
5. Review list
6. Parent report
```

The main product advantage is:

```text
AI makes vocabulary learning feel personal, playful, and adaptive for each child.
```

Recommended product name:

```text
单词星球 / Word Planet
```

Recommended tagline:

```text
每天探索一个单词星球。
Explore words, one planet at a time.
```

import type { PlanetTopic, WordEntry } from "../types";

const schoolWords: WordEntry[] = [
  ["library", "图书馆", "I like reading books in the library.", "我喜欢在图书馆看书。", "a warm school library with shelves and open books", "tricky", "Watch the first syllable: LI-brar-y."],
  ["classroom", "教室", "Our classroom has a big board.", "我们的教室有一块大黑板。", "a bright classroom with desks and a board", "medium", "Say both parts clearly: class-room."],
  ["homework", "家庭作业", "I finish my homework after dinner.", "我晚饭后完成家庭作业。", "a desk with notebooks and a pencil", "medium", "The /h/ sound is soft but clear."],
  ["dictionary", "词典", "I use a dictionary to find new words.", "我用词典查新单词。", "a colorful English dictionary on a desk", "tricky", "Four syllables: dic-tion-ar-y."],
  ["project", "项目", "Our science project is about plants.", "我们的科学项目是关于植物的。", "kids making a school science project", "medium", "Stress the first part: PRO-ject."],
  ["subject", "科目", "My favorite subject is science.", "我最喜欢的科目是科学。", "school subject icons for science art and music", "medium", "Stress the first part: SUB-ject."],
  ["science", "科学", "Science helps us learn about the world.", "科学帮助我们了解世界。", "friendly science table with safe classroom experiment", "medium", "Starts like SAI."],
  ["history", "历史", "History tells stories from long ago.", "历史讲述很久以前的故事。", "history books and a museum map", "tricky", "Three syllables: HIS-to-ry."],
  ["geography", "地理", "Geography teaches us about maps.", "地理教我们认识地图。", "a colorful map globe and compass", "tricky", "Geo sounds like JEE-oh."],
  ["exam", "考试", "The exam has reading and writing questions.", "考试有阅读和写作题。", "a calm test paper with pencils", "easy", "Short /eg-ZAM/ ending."],
  ["question", "问题", "Please read the question carefully.", "请仔细阅读问题。", "a friendly question mark on a worksheet", "medium", "Question starts like KWES."],
  ["answer", "答案", "Write your answer on the line.", "把答案写在线上。", "a worksheet with a neat answer line", "medium", "The w is silent."],
  ["lesson", "课", "The English lesson starts at nine.", "英语课九点开始。", "teacher and students in a lesson", "easy", "Short and gentle: LES-son."],
  ["uniform", "校服", "She wears a blue school uniform.", "她穿着蓝色校服。", "neat school uniform on a hanger", "tricky", "Starts YOU-ni."],
  ["break", "课间休息", "We play outside during the break.", "课间休息时我们在外面玩。", "kids relaxing in a school playground", "easy", "Long A sound."],
  ["playground", "操场", "The playground is behind the school.", "操场在学校后面。", "sunny school playground", "medium", "Two parts: play-ground."],
  ["teacher", "老师", "Our teacher reads a story.", "我们的老师读了一个故事。", "friendly teacher reading a book", "easy", "Long ee sound."],
  ["classmate", "同学", "My classmate helps me spell the word.", "我的同学帮我拼这个单词。", "two classmates studying together", "medium", "Two parts: class-mate."],
  ["notebook", "笔记本", "I write new words in my notebook.", "我把新单词写在笔记本里。", "a notebook with English vocabulary", "medium", "Two parts: note-book."],
  ["keyboard", "键盘", "Type the word on the keyboard.", "在键盘上输入这个单词。", "a colorful computer keyboard", "medium", "Two parts: key-board."],
  ["computer", "电脑", "The computer shows a picture game.", "电脑显示了一个图片游戏。", "a classroom computer with a learning game", "medium", "Stress the second part: com-PU-ter."],
  ["poster", "海报", "The poster is on the classroom wall.", "海报在教室墙上。", "school poster on a classroom wall", "easy", "Long O at the start."],
  ["ruler", "尺子", "Use a ruler to draw a straight line.", "用尺子画一条直线。", "a ruler and pencil on paper", "easy", "Long OO sound."],
  ["crayon", "蜡笔", "Choose a green crayon.", "选择一支绿色蜡笔。", "a box of bright crayons", "medium", "Cray sounds like K-ray."],
  ["backpack", "书包", "My backpack is next to my desk.", "我的书包在我的课桌旁边。", "a school backpack beside a desk", "medium", "Two parts: back-pack."]
].map(([word, meaningZh, example, exampleZh, imagePromptHint, spellingDifficulty, pronunciationNote]) => ({
  id: `school-${word}`,
  word,
  meaningZh,
  topic: "school",
  level: word === "geography" || word === "history" ? "A2 Flyers" : "A1 Movers",
  example,
  exampleZh,
  imagePromptHint,
  spellingDifficulty,
  pronunciationNote
})) as WordEntry[];

const topicSeeds: Array<[PlanetTopic, string, Array<[string, string, string]>]> = [
  ["animals", "A1 Movers", [["rabbit", "兔子", "The rabbit can jump."], ["tiger", "老虎", "The tiger walks quietly."], ["monkey", "猴子", "The monkey climbs a tree."], ["dolphin", "海豚", "The dolphin swims fast."], ["penguin", "企鹅", "The penguin is funny."], ["kangaroo", "袋鼠", "The kangaroo has strong legs."], ["giraffe", "长颈鹿", "The giraffe is tall."], ["parrot", "鹦鹉", "The parrot can talk."], ["whale", "鲸鱼", "The whale is very big."], ["fox", "狐狸", "The fox runs in the forest."]]],
  ["food", "A1 Movers", [["sandwich", "三明治", "I eat a sandwich for lunch."], ["noodle", "面条", "The noodles are hot."], ["pancake", "煎饼", "A pancake is on the plate."], ["yogurt", "酸奶", "Yogurt is cold and sweet."], ["vegetable", "蔬菜", "Vegetables are good for us."], ["strawberry", "草莓", "The strawberry is red."], ["sausage", "香肠", "The sausage is on the fork."], ["cookie", "饼干", "I share a cookie."], ["soup", "汤", "The soup smells nice."], ["cereal", "麦片", "I eat cereal in the morning."]]],
  ["weather", "A1 Movers", [["cloudy", "多云的", "It is cloudy today."], ["storm", "暴风雨", "The storm is loud."], ["rainbow", "彩虹", "A rainbow is in the sky."], ["windy", "有风的", "It is windy in the park."], ["snowy", "下雪的", "The snowy day is cold."], ["temperature", "温度", "The temperature is low."], ["sunshine", "阳光", "Sunshine makes the room bright."], ["foggy", "有雾的", "The morning is foggy."], ["thunder", "雷声", "Thunder comes after lightning."], ["season", "季节", "Spring is my favorite season."]]],
  ["actions", "A1 Movers", [["borrow", "借入", "I borrow a book."], ["return", "归还", "Please return the ruler."], ["collect", "收集", "We collect word stars."], ["explain", "解释", "Can you explain the answer?"], ["practice", "练习", "Practice the word again."], ["describe", "描述", "Describe the picture."], ["compare", "比较", "Compare the two pictures."], ["remember", "记住", "I remember this word."], ["improve", "提高", "You improve every day."], ["repeat", "重复", "Repeat the sentence."]]],
  ["family", "A1 Movers", [["parent", "父母", "A parent reads the report."], ["cousin", "堂/表兄弟姐妹", "My cousin likes games."], ["daughter", "女儿", "The daughter is nine."], ["grandson", "孙子", "The grandson smiles."], ["aunt", "阿姨", "My aunt visits us."], ["uncle", "叔叔", "My uncle cooks dinner."], ["neighbor", "邻居", "Our neighbor has a dog."], ["relative", "亲戚", "A relative comes to lunch."], ["family", "家庭", "My family is happy."], ["grandparent", "祖父母", "A grandparent tells a story."]]],
  ["body", "A1 Movers", [["shoulder", "肩膀", "My shoulder hurts."], ["stomach", "胃", "My stomach is full."], ["finger", "手指", "Point with your finger."], ["knee", "膝盖", "My knee is dirty."], ["neck", "脖子", "The scarf is around my neck."], ["tooth", "牙齿", "A tooth can be white."], ["voice", "声音", "Use a clear voice."], ["heart", "心脏", "My heart beats fast."], ["brain", "大脑", "The brain helps us think."], ["elbow", "肘部", "Bend your elbow."]]],
  ["emotions", "A1 Movers", [["excited", "兴奋的", "I am excited about the game."], ["worried", "担心的", "She is worried about the exam."], ["proud", "自豪的", "He is proud of his project."], ["surprised", "惊讶的", "I am surprised by the story."], ["brave", "勇敢的", "Be brave and try again."], ["calm", "平静的", "Take a calm breath."], ["lonely", "孤单的", "The child feels lonely."], ["friendly", "友好的", "The teacher is friendly."], ["careful", "仔细的", "Be careful with spelling."], ["confident", "自信的", "She feels confident."]]]
];

const otherWords: WordEntry[] = topicSeeds.flatMap(([topic, level, rows]) =>
  rows.map(([word, meaningZh, example]) => ({
    id: `${topic}-${word}`,
    word,
    meaningZh,
    topic,
    level: level as WordEntry["level"],
    example,
    exampleZh: "",
    imagePromptHint: `a child-friendly illustration of ${word} for ${topic} vocabulary`,
    spellingDifficulty: word.length > 8 ? "tricky" : word.length > 6 ? "medium" : "easy",
    pronunciationNote: "Listen, then repeat clearly."
  }))
);

export function getCuratedVocabulary(): WordEntry[] {
  return [...schoolWords, ...otherWords];
}

export function getTopicWords(topic: PlanetTopic): WordEntry[] {
  return getCuratedVocabulary().filter((entry) => entry.topic === topic);
}

export function selectDailyWords(topic: PlanetTopic, count: number): WordEntry[] {
  return getTopicWords(topic).slice(0, count);
}


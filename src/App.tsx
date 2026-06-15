import React, { useState, useEffect, useRef } from 'react';
import {
  Users, Heart, Skull, History, Swords, Trophy, RotateCcw, Play,
  Sparkles, Zap, Copy, Check, Clock, Settings2, Plus, Trash2,
  Percent, MessageSquare, Mic, MicOff, Activity, ShieldAlert,
  UserPlus, Hand, ToggleLeft, ToggleRight, Type, MessageCircle,
  Edit3, GripVertical, Languages, Scale
} from 'lucide-react';

// Firebase Imports
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, updateDoc } from 'firebase/firestore';

// グローバル変数の型宣言
declare const __firebase_config: string | undefined;
declare const __initial_auth_token: string | undefined;
declare const __app_id: string | undefined;

const apiKey = "";

// Firebase 初期化のセーフティラッパー
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
let app: ReturnType<typeof initializeApp> | undefined;
let auth: ReturnType<typeof getAuth> | undefined;
let db: ReturnType<typeof getFirestore> | undefined;
const hasFirebaseConfig = firebaseConfig && firebaseConfig.apiKey;

if (hasFirebaseConfig) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.error("Firebase initialization failed:", e);
  }
}
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// 型定義
interface Player {
  id: string;
  uid?: string;
  name: string;
  hp: number;
  status: 'alive' | 'dead';
  team?: string | null;
  teamColor?: string | null;
  teamIndex?: number;
}

interface EliminatedPlayer {
  name: string;
  turn: number;
}

interface LogEntry {
  id: number;
  turn: number;
  type: string;
  message: string;
  amount?: string | number;
  target?: string;
}

interface DisplayResult {
  player: string;
  amount: string | number;
}

interface LastResult {
  player: string;
  targetIds: string[];
  amount: string | number;
  type: string;
  isReverse?: boolean;
  isMulti?: boolean;
}

interface FixedItem {
  id: number;
  value: number;
  prob: number;
}

interface Config {
  rangeMin: number;
  rangeMax: number;
  rangeProb: number;
  fixedItems: FixedItem[];
}

interface ReviveEvent {
  id: number;
  turn: number;
  type: 'steal' | 'copy';
}

interface ManualPlayer {
  name: string;
  teamIndex: number;
}

const App = () => {
  const [user, setUser] = useState<any>(null);
  const [phase, setPhase] = useState('home');
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [roomHostId, setRoomHostId] = useState<string | null>(null);
  const [joinRoomIdInput, setJoinRoomIdInput] = useState('');
  const [playerNameInput, setPlayerNameInput] = useState('');
  const [joinError, setJoinError] = useState('');

  const [title, setTitle] = useState('');
  const [mode, setMode] = useState('individual');
  const [teamCount, setTeamCount] = useState(2);
  const [teamNames, setTeamNames] = useState(['チームA', 'チームB', 'チームC', 'チームD', 'チームE', 'チームF']);
  const [playerListText, setPlayerListText] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [eliminated, setEliminated] = useState<EliminatedPlayer[]>([]);
  const [turn, setTurn] = useState(1);
  const [isSpinning, setIsSpinning] = useState(false);
  const [displayResult, setDisplayResult] = useState<DisplayResult>({ player: '？？？', amount: '？' });
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [initialHP, setInitialHP] = useState(1000);
  const [spinDuration, setSpinDuration] = useState(1.5);
  const [healInterval, setHealInterval] = useState(10);

  const [isManualModeEnabled, setIsManualModeEnabled] = useState(false);
  const [isSpecialEventEnabled, setIsSpecialEventEnabled] = useState(true);
  const [specialEventProb, setSpecialEventProb] = useState(25);
  const [enabledSpecialEvents, setEnabledSpecialEvents] = useState([
    'reverseMode', 'multiMode', 'numberFormat', 'nameTranslation', 'feint',
    'diceMode', 'reverseHealDamage', 'instantDeath', 'trueRandom'
  ]);
  const [isHpBalanceEnabled, setIsHpBalanceEnabled] = useState(true);

  const [numberFormat, setNumberFormat] = useState('default');
  const [nameLanguage, setNameLanguage] = useState('default');
  const [translatedMap, setTranslatedMap] = useState<Record<string, string>>({});

  const ALL_NUMBER_FORMATS = [
    { id: 'roman', label: 'ローマ数字' }, { id: 'greek', label: 'ギリシャ数字' }, { id: 'kanji', label: '漢数字' }, { id: 'daiji', label: '大字' },
    { id: 'indic', label: 'インド数字' }, { id: 'thai', label: 'タイ数字' }, { id: 'arabic', label: 'アラビア文字数字' }, { id: 'fullwidth', label: '全角数字' },
    { id: 'circled', label: '丸数字' }, { id: 'babylonian', label: 'バビロニア数字' }, { id: 'mayan', label: 'マヤ数字' }, { id: 'egyptian', label: 'エジプト数字' },
    { id: 'devanagari', label: 'デーヴァナーガリー' }, { id: 'bengali', label: 'ベンガル数字' }, { id: 'gujarati', label: 'グジャラート数字' }, { id: 'gurmukhi', label: 'グルムキー数字' },
    { id: 'kannada', label: 'カンナダ数字' }, { id: 'telugu', label: 'テルグ数字' }, { id: 'malayalam', label: 'マラヤーラム数字' }, { id: 'tibetan', label: 'チベット数字' },
    { id: 'myanmar', label: 'ビルマ数字' }, { id: 'khmer', label: 'クメール数字' }, { id: 'lao', label: 'ラーオ数字' }, { id: 'mongolian', label: 'モンゴル数字' },
    { id: 'ethiopic', label: 'ゲエズ数字' }, { id: 'hebrew', label: 'ヘブライ数字' }, { id: 'armenian', label: 'アルメニア数字' }, { id: 'georgian', label: 'ジョージア数字' },
    { id: 'oriya', label: 'オリヤー数字' }, { id: 'tamil', label: 'タミル数字' }, { id: 'tai_tham', label: 'タイ・タム数字' }, { id: 'sundanese', label: 'スンダ数字' },
    { id: 'balinese', label: 'バリ数字' }, { id: 'javanese', label: 'ジャワ数字' }, { id: 'cham', label: 'チャム数字' }
  ];

  const ALL_LANGUAGES = [
    "アラビア語", "イタリア語", "インドネシア語", "ウクライナ語", "オランダ語",
    "スペイン語(スペイン)", "タイ語", "ドイツ語", "トルコ語", "ヒンディー語",
    "フランス語", "ベトナム語", "ポーランド語", "ポルトガル語(ブラジル)", "ロシア語",
    "英語(アメリカ)", "英語(イギリス)", "韓国語", "中国語(国語、簡体字)", "中国語(普通話、簡体字)"
  ];

  const [diceConfig, setDiceConfig] = useState({ min: 1, max: 100 });
  const [enabledFormats, setEnabledFormats] = useState(ALL_NUMBER_FORMATS.map(f => f.id));
  const [enabledLangs, setEnabledLangs] = useState(ALL_LANGUAGES);

  const [manualPlayers, setManualPlayers] = useState<ManualPlayer[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [isManualSelectionPhase, setIsManualSelectionPhase] = useState(false);

  const [config, setConfig] = useState<Config>({
    rangeMin: 1, rangeMax: 200, rangeProb: 70,
    fixedItems: [{ id: 1, value: 500, prob: 20 }, { id: 2, value: 1000, prob: 10 }]
  });

  const [reviveEvents, setReviveEvents] = useState<ReviveEvent[]>([
    { id: 1, turn: 50, type: 'steal' }, { id: 2, turn: 100, type: 'copy' }
  ]);

  const [animatingPlayerIds, setAnimatingPlayerIds] = useState<string[]>([]);
  const [animatingType, setAnimatingType] = useState<string | null>(null);
  const [isLogsCopied, setIsLogsCopied] = useState(false);
  const [isRankingCopied, setIsRankingCopied] = useState(false);
  const [isDiscordCopied, setIsDiscordCopied] = useState(false);

  const [draggedPlayer, setDraggedPlayer] = useState<Player | ManualPlayer | null>(null);
  const [touchTargetTeam, setTouchTargetTeam] = useState<number | null>(null);

  useEffect(() => {
    const initAuth = async () => {
      if (!hasFirebaseConfig || !auth) {
        console.warn("Firebase config is missing or incomplete. Offline mode only.");
        return;
      }
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Firebase authentication failed. Continuing in offline mode:", err);
      }
    };
    initAuth();
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, setUser);
      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    if (!user || !currentRoomId || !db) return;
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', currentRoomId);
    const unsub = onSnapshot(roomRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setRoomHostId(data.hostId);

        if (data.status === 'joining') {
          syncSettingsFromRoom(data.settings);
          setPlayers(data.players);
          if (phase !== 'multi_lobby' && phase !== 'multi_name') setPhase('multi_lobby');
        }

        if (data.status === 'playing') {
          if (phase !== 'playing') setPhase('playing');
          setPlayers(data.players);
          setTurn(data.gameState.turn);
          setLogs(data.gameState.logs);
          setEliminated(data.gameState.eliminated);
          setIsSpinning(data.gameState.isSpinning);
          setDisplayResult(data.gameState.displayResult);
          setLastResult(data.gameState.lastResult);
        }

        if (data.status === 'result') {
          if (phase !== 'result') setPhase('result');
          setPlayers(data.players);
          setLogs(data.gameState.logs);
          setEliminated(data.gameState.eliminated);
        }
      }
    }, (err) => {
      console.error("Firestore onSnapshot error", err);
    });
    return () => unsub();
  }, [user, currentRoomId, phase]);

  useEffect(() => {
    if (lastResult && lastResult.targetIds) {
      setAnimatingPlayerIds(lastResult.targetIds);
      setAnimatingType(lastResult.type);
      const timer = setTimeout(() => {
        setAnimatingPlayerIds([]);
        setAnimatingType(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [lastResult]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isMultiplayer && isSpinning && user?.uid !== roomHostId && phase === 'playing') {
      interval = setInterval(() => {
        const alivePlayers = players.filter(p => p.status === 'alive');
        if (alivePlayers.length > 0) {
          const p = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
          setDisplayResult({ player: p.name, amount: Math.floor(Math.random() * 999) });
        }
      }, 60);
    }
    return () => clearInterval(interval);
  }, [isMultiplayer, isSpinning, user, roomHostId, players, phase]);

  const syncSettingsFromRoom = (s: any) => {
    setTitle(s.title || ''); setMode(s.mode); setTeamCount(s.teamCount); setTeamNames(s.teamNames);
    setInitialHP(s.initialHP); setSpinDuration(s.spinDuration); setHealInterval(s.healInterval);
    setIsHpBalanceEnabled(s.isHpBalanceEnabled);
    setIsSpecialEventEnabled(s.isSpecialEventEnabled); setSpecialEventProb(s.specialEventProb);
    setEnabledSpecialEvents(s.enabledSpecialEvents); setDiceConfig(s.diceConfig);
    setEnabledFormats(s.enabledFormats); setEnabledLangs(s.enabledLangs); setConfig(s.config); setReviveEvents(s.reviveEvents);
  };

  const toggleSpecialEvent = (type: string) => {
    setEnabledSpecialEvents(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const totalProb = (parseInt(String(config.rangeProb)) || 0) + config.fixedItems.reduce((sum, item) => sum + (parseInt(String(item.prob)) || 0), 0);
  const isManualTurn = !isMultiplayer && isManualModeEnabled && ((turn >= 41 && turn <= 49) || (turn >= 51 && turn <= 60));

  const convertNumber = (num: number | string, format: string): string | number => {
    if (typeof num !== 'number' || format === 'default') return num;
    switch (format) {
      case 'roman': {
        const roman: Record<string, number> = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
        let res = '', n = num;
        for (const i in roman) { while (n >= roman[i]) { res += i; n -= roman[i]; } }
        return res || '0';
      }
      case 'greek': return num.toString().split('').map(d => ['Α', 'Β', 'Γ', 'Δ', 'Ｅ', 'Ϛ', 'Ｚ', 'Ｈ', 'Θ'][parseInt(d) - 1] || d).join('');
      case 'kanji': return num.toString().split('').map(d => ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'][parseInt(d)]).join('');
      case 'daiji': return num.toString().split('').map(d => ['零', '壱', '弐', '参', '肆', '伍', '陸', '漆', '捌', '玖'][parseInt(d)]).join('');
      case 'indic': return num.toString().split('').map(d => ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'][parseInt(d)]).join('');
      case 'thai': return num.toString().split('').map(d => ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'][parseInt(d)]).join('');
      case 'arabic': return num.toString().split('').map(d => ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'][parseInt(d)]).join('');
      case 'fullwidth': return num.toString().split('').map(d => ['０', '１', '２', '３', '４', '５', '６', '７', '８', '９'][parseInt(d)]).join('');
      case 'circled': {
        const circled = ['⓪', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];
        if (num <= 20) return circled[num];
        return num.toString().split('').map(d => circled[parseInt(d)] || d).join('');
      }
      case 'devanagari': return num.toString().split('').map(d => ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'][parseInt(d)]).join('');
      default: return num;
    }
  };

  useEffect(() => {
    if (!isMultiplayer) {
      const names = playerListText.split('\n').map(n => n.trim()).filter(n => n !== '');
      const uniqueNames = [...new Set(names)];
      setManualPlayers(prev => uniqueNames.map((name, index) => {
        const existing = prev.find(p => p.name === name);
        if (existing) return existing;
        return { name, teamIndex: mode === 'team' ? (index % teamCount) : 0 };
      }));
    }
  }, [playerListText, teamCount, mode, isMultiplayer]);

  useEffect(() => {
    if (phase === 'playing' && !isSpinning && (!isMultiplayer || user?.uid === roomHostId)) {
      if (!isSpecialEventEnabled) {
        setNumberFormat('default'); setNameLanguage('default'); setTranslatedMap({});
        return;
      }
      const randomValue = Math.random();
      if (randomValue >= specialEventProb / 100) {
        setNumberFormat('default'); setNameLanguage('default'); setTranslatedMap({});
      } else {
        const pool: string[] = [];
        if (enabledSpecialEvents.includes('numberFormat') && enabledFormats.length > 0) pool.push('format');
        if (enabledSpecialEvents.includes('nameTranslation') && enabledLangs.length > 0) pool.push('lang');

        if (pool.length === 0) {
          setNumberFormat('default'); setNameLanguage('default');
        } else {
          const choice = pool[Math.floor(Math.random() * pool.length)];
          if (choice === 'format') {
            setNumberFormat(enabledFormats[Math.floor(Math.random() * enabledFormats.length)]);
            setNameLanguage('default');
          } else {
            setNameLanguage(enabledLangs[Math.floor(Math.random() * enabledLangs.length)]);
            setNumberFormat('default');
          }
        }
      }
    }
  }, [turn, phase, isSpecialEventEnabled, specialEventProb, enabledSpecialEvents, enabledFormats, enabledLangs, isMultiplayer, user, roomHostId, isSpinning]);

  const generateTranslatedName = async (name: string, targetLang: string): Promise<string> => {
    if (targetLang === 'default' || !isSpecialEventEnabled) return name;
    if (translatedMap[name]) return translatedMap[name];

    const delays = [1000, 2000, 4000, 8000, 16000];
    let retries = 0;

    while (retries <= 5) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `以下のプレイヤー名を「${targetLang}」に翻訳または音訳してください。余計な説明は省き、名前のみを出力してください。\n名前: ${name}` }] }]
          })
        });
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || name;
        setTranslatedMap(prev => ({ ...prev, [name]: text }));
        return text;
      } catch (e) {
        if (retries === 5) return name;
        await new Promise(r => setTimeout(r, delays[retries]));
        retries++;
      }
    }
    return name;
  };

  const addFixedItem = () => {
    if (config.fixedItems.length >= 5) return;
    const newId = config.fixedItems.length > 0 ? Math.max(...config.fixedItems.map(i => i.id)) + 1 : 1;
    setConfig({ ...config, fixedItems: [...config.fixedItems, { id: newId, value: 500, prob: 0 }] });
  };
  const removeFixedItem = (id: number) => setConfig({ ...config, fixedItems: config.fixedItems.filter(item => item.id !== id) });
  const handleSpecialEventProbComplete = (e: React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) => {
    if (e.type === 'blur' || (e.type === 'keydown' && (e as React.KeyboardEvent).key === 'Enter')) {
      setSpecialEventProb(Math.min(100, Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1)));
    }
  };
  const handleConfigComplete = (e: React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>, field: keyof Config, min: number, max: number | null = null) => {
    if (e.type === 'blur' || (e.type === 'keydown' && (e as React.KeyboardEvent).key === 'Enter')) {
      let val = parseInt((e.target as HTMLInputElement).value);
      if (isNaN(val)) val = min;
      if (min !== null) val = Math.max(min, val);
      if (max !== null) val = Math.min(max, val);
      setConfig(prev => ({ ...prev, [field]: val }));
    }
  };
  const updateFixedItemValue = (id: number, field: string, val: string) => setConfig({ ...config, fixedItems: config.fixedItems.map(item => item.id === id ? { ...item, [field]: val } : item) });
  const handleFixedItemComplete = (e: React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>, id: number, field: string, min: number) => {
    if (e.type === 'blur' || (e.type === 'keydown' && (e as React.KeyboardEvent).key === 'Enter')) {
      let val = parseInt((e.target as HTMLInputElement).value);
      if (isNaN(val)) val = min;
      val = Math.max(min, val);
      setConfig(prev => ({ ...prev, fixedItems: prev.fixedItems.map(item => item.id === id ? { ...item, [field]: val } : item) }));
    }
  };
  const addReviveEvent = () => {
    if (reviveEvents.length >= 5) return;
    const newId = reviveEvents.length > 0 ? Math.max(...reviveEvents.map(r => r.id)) + 1 : 1;
    setReviveEvents([...reviveEvents, { id: newId, turn: 50, type: 'steal' }]);
  };
  const removeReviveEvent = (id: number) => setReviveEvents(reviveEvents.filter(r => r.id !== id));
  const updateReviveEventState = (id: number, field: string, val: string) => setReviveEvents(reviveEvents.map(r => r.id === id ? { ...r, [field]: field === 'turn' ? (parseInt(val) || 0) : val } as ReviveEvent : r));
  const autoAssignTeams = () => {
    if (isMultiplayer && user?.uid === roomHostId && db && currentRoomId) {
      const updated = [...players].map((p, i) => ({ ...p, teamIndex: i % teamCount, team: teamNames[i % teamCount] }));
      updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', currentRoomId), { players: updated }).catch(e => console.error(e));
    } else if (!isMultiplayer) {
      setManualPlayers(prev => prev.map((p, i) => ({ ...p, teamIndex: i % teamCount })));
    }
  };
  const updatePlayerTeam = (name: string, teamIdx: string | number) => {
    setManualPlayers(prev => prev.map(p => p.name === name ? { ...p, teamIndex: parseInt(String(teamIdx)) } : p));
  };
  const updateTeamName = (index: number, name: string) => {
    const updated = [...teamNames]; updated[index] = name; setTeamNames(updated);
  };

  const handleCreateRoom = async () => {
    if (!user || !db) return;
    try {
      const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
      await setDoc(roomRef, {
        hostId: user.uid,
        status: 'joining',
        roomId: roomId,
        settings: {
          title, mode, teamCount, teamNames, initialHP, spinDuration, healInterval,
          isHpBalanceEnabled, isSpecialEventEnabled, specialEventProb,
          enabledSpecialEvents, diceConfig, enabledFormats, enabledLangs, config, reviveEvents
        },
        players: [],
        gameState: { turn: 1, logs: [], eliminated: [], isSpinning: false, displayResult: { player: '？？？', amount: '？' }, lastResult: null }
      });
      setCurrentRoomId(roomId);
      setRoomHostId(user.uid);
      setPhase('multi_name');
    } catch (e) {
      console.error("Room creation failed", e);
    }
  };

  const handleJoinRoomStep1 = async () => {
    if (!joinRoomIdInput.trim() || !db) return;
    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', joinRoomIdInput.toUpperCase());
      const snap = await getDoc(roomRef);
      if (snap.exists() && snap.data().status === 'joining') {
        setCurrentRoomId(joinRoomIdInput.toUpperCase());
        syncSettingsFromRoom(snap.data().settings);
        setJoinError('');
        setPhase('multi_name');
      } else {
        setJoinError('無効なルームIDか、すでに開始されています。');
      }
    } catch (e) {
      setJoinError('ルーム情報の取得に失敗しました。');
    }
  };

  const handleJoinRoomFinal = async () => {
    if (!playerNameInput.trim() || !currentRoomId || !user || !db) return;
    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', currentRoomId);
      const snap = await getDoc(roomRef);
      if (snap.exists()) {
        const roomData = snap.data();
        const existing = roomData.players.find((p: Player) => p.uid === user.uid);
        if (!existing) {
          const teamIdx = roomData.settings.mode === 'team' ? (roomData.players.length % roomData.settings.teamCount) : 0;
          const teamName = roomData.settings.mode === 'team' ? (roomData.settings.teamNames[teamIdx] || `チーム${String.fromCharCode(65 + teamIdx)}`) : null;
          const newPlayer = {
            id: `p-${Date.now()}-${user.uid}`, uid: user.uid, name: playerNameInput.trim(), hp: roomData.settings.initialHP, status: 'alive', teamIndex: teamIdx, team: teamName
          };
          await updateDoc(roomRef, { players: [...roomData.players, newPlayer] });
        }
        setPhase('multi_lobby');
      }
    } catch (e) {
      console.error("Joining room final step failed", e);
    }
  };

  const startGameSingle = () => {
    if (totalProb !== 100 || manualPlayers.length < 2) return;
    const colors = ['text-red-400', 'text-blue-400', 'text-emerald-400', 'text-amber-400', 'text-purple-400', 'text-cyan-400'];
    const initialPlayers: Player[] = manualPlayers.map((p, index) => {
      const team = mode === 'team' ? (teamNames[p.teamIndex] || `チーム${String.fromCharCode(65 + p.teamIndex)}`) : null;
      const teamColor = mode === 'team' ? colors[p.teamIndex % colors.length] : null;
      return { id: `p-${Date.now()}-${index}`, name: p.name, hp: initialHP, status: 'alive', team, teamColor, teamIndex: p.teamIndex };
    });
    setPlayers(initialPlayers);
    setPhase('playing'); setTurn(1); setEliminated([]); setLogs([]); setLastResult(null);
    setIsManualSelectionPhase(false); setSelectedPlayerIds([]);
  };

  const startMultiplayerGame = async () => {
    if (!db || !currentRoomId) return;
    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', currentRoomId);
      const colors = ['text-red-400', 'text-blue-400', 'text-emerald-400', 'text-amber-400', 'text-purple-400', 'text-cyan-400'];
      const updatedPlayers = players.map(p => ({
        ...p, teamColor: mode === 'team' ? colors[(p.teamIndex || 0) % colors.length] : null
      }));
      await updateDoc(roomRef, {
        status: 'playing', players: updatedPlayers,
        'gameState.turn': 1, 'gameState.logs': [], 'gameState.eliminated': [], 'gameState.lastResult': null
      });
    } catch (e) {
      console.error("Starting multiplayer game failed", e);
    }
  };

  const generateAmount = (): number => {
    const r = Math.random() * 100;
    let currentProb = parseInt(String(config.rangeProb)) || 0;
    const rangeMin = parseInt(String(config.rangeMin)) || 1;
    const rangeMax = parseInt(String(config.rangeMax)) || 200;

    if (r < currentProb) {
      return Math.floor(Math.random() * (rangeMax - rangeMin + 1)) + rangeMin;
    }
    for (const item of config.fixedItems) {
      const itemProb = parseInt(String(item.prob)) || 0;
      currentProb += itemProb;
      if (r < currentProb) return parseInt(String(item.value)) || 0;
    }
    return rangeMax;
  };

  const copyToClipboard = (text: string, setFeedback: (v: boolean) => void) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try { document.execCommand('copy'); setFeedback(true); setTimeout(() => setFeedback(false), 2000); } catch (err) { }
    document.body.removeChild(textArea);
  };

  const copyRanking = () => {
    const ranking = getCombinedRanking();
    const alive = players.filter(p => p.status === 'alive');
    const winnerTeam = mode === 'team' && alive.length > 0 ? `${alive[0].team}の勝利！\n` : '';
    const rankingText = `${title}\nランキング結果［第${turn}ターンで終了］\n${winnerTeam}` + ranking.map((p, i) => `${i + 1}位:${p.team ? `［${p.team}］` : ''}${p.name}${p.status === 'alive' ? `［ライフ${p.hp}で生存］` : `［第${(p as any).turn}ターンで脱落］`}`).join('\n');
    copyToClipboard(rankingText, setIsRankingCopied);
  };

  const copyDiscordRanking = () => {
    const ranking = getCombinedRanking();
    const alive = players.filter(p => p.status === 'alive');
    const winnerTeam = mode === 'team' && alive.length > 0 ? `**${alive[0].team}の勝利！**\n` : '';
    const rankingText = `# ${title}\n## ランキング結果［第${turn}ターンで終了］\n${winnerTeam}` + ranking.map((p, i) => `> ${i + 1}位:${p.team ? `［${p.team}］` : ''}${p.name}${p.status === 'alive' ? `［ライフ${p.hp}で生存］` : `［第${(p as any).turn}ターンで脱落］`}`).join('\n');
    copyToClipboard(rankingText, setIsDiscordCopied);
  };

  const copyLogs = () => {
    const text = logs.map(l => `T${l.turn}: ${l.message}`).join('\n');
    copyToClipboard(text, setIsLogsCopied);
  };

  const isHealTurn = turn % healInterval === 0 && !reviveEvents.some(r => r.turn === turn);
  const currentReviveEvent = reviveEvents.find(r => r.turn === turn);
  const isReviveTurn = !!currentReviveEvent;

  const getPlayerWeights = (alivePlayers: Player[]) => {
    if (!isHpBalanceEnabled) return alivePlayers.map(p => ({ ...p, weight: 1 }));
    const totalHp = alivePlayers.reduce((sum, p) => sum + p.hp, 0);
    const avgHp = totalHp / alivePlayers.length;
    return alivePlayers.map(p => ({ ...p, weight: p.hp / avgHp }));
  };

  const selectWeightedPlayer = (weightedPlayers: (Player & { weight: number })[]) => {
    const totalWeight = weightedPlayers.reduce((sum, p) => sum + p.weight, 0);
    let r = Math.random() * totalWeight;
    for (const p of weightedPlayers) { r -= p.weight; if (r <= 0) return p; }
    return weightedPlayers[weightedPlayers.length - 1];
  };

  const updateDisplayResultMulti = async (resultObj: DisplayResult) => {
    setDisplayResult(resultObj);
    if (isMultiplayer && user?.uid === roomHostId && db && currentRoomId) {
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', currentRoomId), { 'gameState.displayResult': resultObj });
      } catch (e) {
        console.error("Firestore updateDisplayResult failed", e);
      }
    }
  };

  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayerIds(prev =>
      prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]
    );
  };

  const spinRoulette = async () => {
    if (isSpinning) return;
    if (isMultiplayer && user?.uid !== roomHostId) return;

    const alivePlayers = players.filter(p => p.status === 'alive');
    const deadPlayers = players.filter(p => p.status === 'dead');
    let isGameOver = mode === 'team' ? new Set(alivePlayers.map(p => p.team)).size <= 1 : alivePlayers.length <= 1;
    if (isGameOver && !isReviveTurn) {
      if (isMultiplayer && db && currentRoomId) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', currentRoomId), { status: 'result' }).catch(e => console.error(e));
      } else {
        setPhase('result');
      }
      return;
    }

    setIsSpinning(true);
    if (isMultiplayer && db && currentRoomId) {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', currentRoomId), { 'gameState.isSpinning': true }).catch(e => console.error(e));
    }

    let effectType = isReviveTurn ? 'revive' : (isHealTurn ? 'heal' : 'damage');
    const intervalMs = 60;
    const maxSpins = Math.max(10, Math.floor((spinDuration * 1000) / intervalMs));

    const isSpecialActive = isSpecialEventEnabled && Math.random() < (specialEventProb / 100) && !isReviveTurn && !isManualTurn;
    let isReverse = false, isMulti = false, isFeint = false, isInstantDeath = false, isReverseHealDamage = false, isTrueRandom = false;

    if (isSpecialActive) {
      const logicPool: string[] = [];
      if (enabledSpecialEvents.includes('reverseMode')) logicPool.push('reverse');
      if (enabledSpecialEvents.includes('multiMode')) logicPool.push('multi');
      if (enabledSpecialEvents.includes('feint')) logicPool.push('feint');
      if (enabledSpecialEvents.includes('diceMode')) logicPool.push('dice');
      if (enabledSpecialEvents.includes('reverseHealDamage')) logicPool.push('reverseHealDamage');
      if (enabledSpecialEvents.includes('instantDeath')) logicPool.push('instantDeath');
      if (enabledSpecialEvents.includes('trueRandom')) logicPool.push('trueRandom');

      if (logicPool.length > 0) {
        const typeChoice = logicPool[Math.floor(Math.random() * logicPool.length)];
        if (typeChoice === 'reverse') isReverse = true;
        else if (typeChoice === 'multi') isMulti = true;
        else if (typeChoice === 'feint') isFeint = true;
        else if (typeChoice === 'reverseHealDamage') { isReverseHealDamage = true; effectType = effectType === 'heal' ? 'damage' : 'heal'; }
        else if (typeChoice === 'instantDeath') { isInstantDeath = true; effectType = 'damage'; }
        else if (typeChoice === 'trueRandom') isTrueRandom = true;
      }
    }

    const weightedPlayers = getPlayerWeights(alivePlayers);
    if (isTrueRandom) weightedPlayers.forEach(p => (p as any).weight = 1);

    let spins = 0;
    const spinInterval = setInterval(() => {
      const randomAlive = selectWeightedPlayer(weightedPlayers);
      if (isManualTurn && !isReviveTurn) {
        setDisplayResult({ player: "対象を選択してください", amount: convertNumber(generateAmount(), numberFormat) });
      } else if (isReviveTurn && currentReviveEvent?.type === 'steal') {
        setDisplayResult({ player: `奪う対象: ${randomAlive.name}`, amount: "50%" });
      } else if (isReviveTurn && currentReviveEvent?.type === 'copy') {
        setDisplayResult({ player: `コピー元: ${randomAlive.name}`, amount: "COPY" });
      } else if (isInstantDeath) {
        const playerNameDisp = nameLanguage !== 'default' ? (translatedMap[randomAlive.name] || randomAlive.name) : randomAlive.name;
        setDisplayResult({ player: `【即死】${playerNameDisp}`, amount: "DEATH" });
      } else {
        const prefix = isReverse ? "【以外】" : (isMulti ? "【複数】" : "");
        const playerNameDisp = nameLanguage !== 'default' ? (translatedMap[randomAlive.name] || randomAlive.name) : randomAlive.name;
        setDisplayResult({ player: `${prefix}${playerNameDisp}`, amount: convertNumber(generateAmount(), numberFormat) });
      }
      spins++;
      if (spins >= maxSpins) {
        clearInterval(spinInterval);
        if (isManualTurn && !isReviveTurn) finalizeSpinManual(effectType);
        else finalizeSpin(effectType, alivePlayers, deadPlayers, isReverse, isMulti, weightedPlayers, isFeint, isInstantDeath, isReverseHealDamage);
      }
    }, intervalMs);
  };

  const finalizeSpinManual = (effectType: string) => {
    const finalAmount = generateAmount();
    setDisplayResult({ player: "対象を選択してください", amount: convertNumber(finalAmount, numberFormat) });
    setLastResult({ player: "手動選択", amount: finalAmount, targetIds: [], type: effectType });
    setIsSpinning(false); setIsManualSelectionPhase(true); setSelectedPlayerIds([]);
  };

  const finalizeSpin = async (
    effectType: string,
    alivePlayers: Player[],
    deadPlayers: Player[],
    isReverse: boolean,
    isMulti: boolean,
    weightedPlayers: (Player & { weight: number })[],
    isFeint: boolean,
    isInstantDeath: boolean,
    isReverseHealDamage: boolean
  ) => {
    let chosenPlayer = selectWeightedPlayer(weightedPlayers);
    let reviveTarget: Player | undefined;
    let finalAmount: number | string = 0;
    let updatedPlayers = [...players];
    let customLogData: Partial<LogEntry> | null = null;
    let targetIds: string[] = [];

    if (isFeint) {
      const fakePlayer = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      const fakeAmount = generateAmount();
      await updateDisplayResultMulti({ player: `【！？】${fakePlayer.name}`, amount: convertNumber(fakeAmount, numberFormat) });
      setAnimatingPlayerIds([fakePlayer.id]); setAnimatingType(effectType);
      await new Promise(r => setTimeout(r, 1200));
    }

    let displayPlayerName = chosenPlayer.name;
    if (nameLanguage !== 'default') displayPlayerName = await generateTranslatedName(chosenPlayer.name, nameLanguage);

    if (effectType === 'revive') {
      if (deadPlayers.length === 0) {
        await updateDisplayResultMulti({ player: "脱落者なし", amount: "SKIP" });
        customLogData = { type: 'system', message: "復活対象なし、スキップ", target: "なし" };
      } else {
        if (currentReviveEvent?.type === 'steal') {
          const lastEliminated = [...eliminated].reverse()[0];
          reviveTarget = players.find(p => p.name === lastEliminated.name);
          if (reviveTarget) {
            finalAmount = Math.floor(chosenPlayer.hp / 2);
            updatedPlayers = updatedPlayers.map(p => {
              if (p.id === chosenPlayer.id) return { ...p, hp: p.hp - (finalAmount as number) };
              if (p.id === reviveTarget!.id) return { ...p, hp: finalAmount as number, status: 'alive' };
              return p;
            });
            customLogData = { type: 'revive', message: `${chosenPlayer.name}から${finalAmount}奪い${reviveTarget.name}復活`, amount: finalAmount, target: reviveTarget.name };
          }
        } else {
          reviveTarget = deadPlayers[Math.floor(Math.random() * deadPlayers.length)];
          finalAmount = chosenPlayer.hp;
          updatedPlayers = updatedPlayers.map(p => p.id === reviveTarget!.id ? { ...p, hp: finalAmount as number, status: 'alive' } : p);
          customLogData = { type: 'revive', message: `${chosenPlayer.name}のHPをコピーし${reviveTarget.name}復活`, amount: finalAmount, target: reviveTarget.name };
        }
        if (reviveTarget) {
          await updateDisplayResultMulti({ player: `${reviveTarget.name} 復活！`, amount: convertNumber(finalAmount as number, numberFormat) });
          targetIds = [reviveTarget.id];
          setEliminated(prev => prev.filter(e => e.name !== reviveTarget!.name));
        }
      }
    } else if (isInstantDeath) {
      targetIds = [chosenPlayer.id];
      updatedPlayers = updatedPlayers.map(p => targetIds.includes(p.id) ? { ...p, hp: 0 } : p);
      await updateDisplayResultMulti({ player: displayPlayerName, amount: "DEATH" });
      customLogData = { type: 'damage', message: `【脱落イベント】${chosenPlayer.name}が即死！`, amount: "DEATH", target: chosenPlayer.name };
      finalAmount = "DEATH";
    } else {
      finalAmount = enabledSpecialEvents.includes('diceMode') && !isReverse && !isMulti && !isFeint && Math.random() < 0.5
        ? (Math.floor(Math.random() * (diceConfig.max - diceConfig.min + 1)) + diceConfig.min)
        : generateAmount();
      const revMsg = isReverseHealDamage ? '(効果反転)' : '';

      if (isReverse) {
        targetIds = alivePlayers.filter(p => p.id !== chosenPlayer.id).map(p => p.id);
        updatedPlayers = updatedPlayers.map(p => targetIds.includes(p.id) ? { ...p, hp: Math.max(0, effectType === 'heal' ? p.hp + (finalAmount as number) : p.hp - (finalAmount as number)) } : p);
        await updateDisplayResultMulti({ player: `【以外】${displayPlayerName}`, amount: convertNumber(finalAmount as number, numberFormat) });
        targetIds = ["SPECIAL"];
        customLogData = { type: effectType, message: `${chosenPlayer.name}「以外」全員に${finalAmount}${effectType === 'heal' ? '回復' : 'ダメージ'}${revMsg}`, amount: finalAmount, target: "複数名" };
      } else if (isMulti) {
        const count = Math.max(2, Math.floor(Math.random() * (alivePlayers.length)) + 1);
        const shuffled = [...alivePlayers].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, count);

        await updateDisplayResultMulti({ player: `【マルチ発動】${selected.length}名`, amount: convertNumber(finalAmount as number, numberFormat) });
        await new Promise(r => setTimeout(r, 1000));

        targetIds = [];
        for (let i = 0; i < selected.length; i++) {
          const target = selected[i];
          targetIds.push(target.id);
          const targetNameDisp = nameLanguage !== 'default' ? (await generateTranslatedName(target.name, nameLanguage)) : target.name;
          const msg = `${targetNameDisp}に${convertNumber(finalAmount as number, numberFormat)}${effectType === 'heal' ? '回復' : 'ダメージ'}`;
          await updateDisplayResultMulti({ player: msg, amount: convertNumber(finalAmount as number, numberFormat) });
          await new Promise(r => setTimeout(r, 1200));
        }
        updatedPlayers = updatedPlayers.map(p => targetIds.includes(p.id) ? { ...p, hp: Math.max(0, effectType === 'heal' ? p.hp + (finalAmount as number) : p.hp - (finalAmount as number)) } : p);
        await updateDisplayResultMulti({ player: `【複数】${selected.length}名`, amount: convertNumber(finalAmount as number, numberFormat) });
        targetIds = ["SPECIAL"];
        customLogData = { type: effectType, message: `ランダムに選ばれた${selected.length}名に${finalAmount}${effectType === 'heal' ? '回復' : 'ダメージ'}${revMsg}`, amount: finalAmount, target: `${selected.length}名` };
      } else {
        targetIds = [chosenPlayer.id];
        updatedPlayers = updatedPlayers.map(p => p.id === chosenPlayer.id ? { ...p, hp: Math.max(0, effectType === 'heal' ? p.hp + (finalAmount as number) : p.hp - (finalAmount as number)) } : p);
        await updateDisplayResultMulti({ player: displayPlayerName, amount: convertNumber(finalAmount as number, numberFormat) });
        customLogData = { type: effectType, message: `${chosenPlayer.name}に${finalAmount}${effectType === 'heal' ? '回復' : 'ダメージ'}${revMsg}`, amount: finalAmount, target: chosenPlayer.name };
      }
    }

    const newlyDead: EliminatedPlayer[] = [];
    updatedPlayers = updatedPlayers.map(p => {
      if (p.status === 'alive' && p.hp <= 0) { newlyDead.push({ name: p.name, turn }); return { ...p, hp: 0, status: 'dead' as const }; }
      return p;
    });

    const turnLogs: LogEntry[] = [];
    if (customLogData) turnLogs.push({ id: Date.now(), turn, type: customLogData.type || 'system', message: customLogData.message || '', amount: customLogData.amount, target: customLogData.target });
    if (newlyDead.length > 0) newlyDead.forEach((d, idx) => turnLogs.push({ id: Date.now() + idx + 1, turn, type: 'death', message: `${d.name}が脱落...`, target: d.name }));

    if (isMultiplayer && db && currentRoomId) {
      try {
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', currentRoomId);
        const alivePlayersAfter = updatedPlayers.filter(p => p.status === 'alive');
        const isGameFinished = mode === 'team' ? new Set(alivePlayersAfter.map(p => p.team)).size <= 1 : alivePlayersAfter.length <= 1;
        await updateDoc(roomRef, {
          players: updatedPlayers,
          'gameState.turn': isGameFinished ? turn : turn + 1,
          'gameState.logs': [...turnLogs, ...logs].slice(0, 100),
          'gameState.eliminated': [...eliminated, ...newlyDead],
          'gameState.isSpinning': false,
          'gameState.displayResult': { player: displayPlayerName, amount: convertNumber(finalAmount as number, numberFormat) },
          'gameState.lastResult': { player: chosenPlayer.name, targetIds, amount: finalAmount, type: effectType, isReverse, isMulti },
          ...(isGameFinished ? { status: 'result' } : {})
        });
        setIsSpinning(false);
      } catch (e) {
        console.error("Failed to update multiplayer game state", e);
        setIsSpinning(false);
      }
    } else {
      setPlayers(updatedPlayers);
      if (newlyDead.length > 0) setEliminated(prev => [...prev, ...newlyDead]);
      setLastResult({ player: chosenPlayer.name, targetIds, amount: finalAmount, type: effectType, isReverse, isMulti });
      setLogs(prev => [...turnLogs, ...prev]);
      setTimeout(() => {
        setIsSpinning(false);
        const alivePlayersAfter = updatedPlayers.filter(p => p.status === 'alive');
        const isGameFinished = mode === 'team' ? new Set(alivePlayersAfter.map(p => p.team)).size <= 1 : alivePlayersAfter.length <= 1;
        if (isGameFinished) {
          setPhase('result');
        } else {
          setTurn(t => t + 1);
        }
      }, 2000);
    }
  };

  const applyManualSelection = () => {
    if (!lastResult) return;
    const effectType = lastResult.type;
    const finalAmount = lastResult.amount as number;
    let updatedPlayers = [...players];
    const turnLogs: LogEntry[] = [];
    const targetNames: string[] = [];

    if (selectedPlayerIds.length > 0) {
      updatedPlayers = updatedPlayers.map(p => {
        if (selectedPlayerIds.includes(p.id)) {
          targetNames.push(p.name);
          return { ...p, hp: Math.max(0, effectType === 'heal' ? p.hp + finalAmount : p.hp - finalAmount) };
        }
        return p;
      });
      const newlyDead: EliminatedPlayer[] = [];
      updatedPlayers = updatedPlayers.map(p => {
        if (p.status === 'alive' && p.hp <= 0) { newlyDead.push({ name: p.name, turn }); return { ...p, hp: 0, status: 'dead' as const }; }
        return p;
      });
      setPlayers(updatedPlayers);
      turnLogs.push({ id: Date.now(), turn, type: effectType, message: `【手動選択】${targetNames.join(', ')}に${finalAmount}${effectType === 'heal' ? '回復' : 'ダメージ'}`, amount: finalAmount, target: targetNames.join(', ') });
      if (newlyDead.length > 0) {
        setEliminated(prev => [...prev, ...newlyDead]);
        newlyDead.forEach((d, idx) => turnLogs.push({ id: Date.now() + idx + 1, turn, type: 'death', message: `${d.name}が脱落...`, target: d.name }));
      }
    } else {
      turnLogs.push({ id: Date.now(), turn, type: 'system', message: `対象なし（${finalAmount}${effectType === 'heal' ? '回復' : 'ダメージ'} スキップ）`, target: "なし" });
    }
    setLogs(prev => [...turnLogs, ...prev]);
    setIsManualSelectionPhase(false); setSelectedPlayerIds([]);

    const alivePlayersAfter = updatedPlayers.filter(p => p.status === 'alive');
    const isGameFinished = mode === 'team' ? new Set(alivePlayersAfter.map(p => p.team)).size <= 1 : alivePlayersAfter.length <= 1;
    if (isGameFinished) {
      setPhase('result');
    } else {
      setTurn(t => t + 1);
    }
  };

  const getCombinedRanking = () => {
    const alive = players.filter(p => p.status === 'alive').sort((a, b) => b.hp - a.hp);
    const dead = [...eliminated].reverse().map(e => {
      const p = players.find(player => player.name === e.name);
      return { ...p!, status: 'dead' as const, turn: e.turn };
    });
    return [...alive, ...dead];
  };

  const backToHome = () => {
    setPhase('home');
    setIsMultiplayer(false);
    setCurrentRoomId(null);
    setRoomHostId(null);
    setPlayers([]);
    setEliminated([]);
    setLogs([]);
    setTurn(1);
    setDisplayResult({ player: '？？？', amount: '？' });
    setLastResult(null);
  };

  const RankingList = ({ ranking }: { ranking: any[] }) => (
    <div className="space-y-2 overflow-y-auto flex-1 pr-1 custom-scrollbar">
      {ranking.map((p, index) => {
        const isAlive = p.status === 'alive';
        const isFirst = index === 0 && isAlive;
        const isLowHp = isAlive && p.hp <= initialHP * 0.3;
        return (
          <div key={index} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${isFirst ? 'bg-indigo-600/30 border-indigo-400 shadow-[0_0_25px_rgba(99,102,241,0.4)] scale-[1.02]' : isAlive ? (isLowHp ? 'bg-red-950/20 border-red-800 animate-pulse' : 'bg-slate-900 border-slate-700') : 'bg-slate-950/60 border-slate-900 opacity-60'}`}>
            <div className="flex items-center gap-4 overflow-hidden">
              <span className={`font-black text-lg w-8 shrink-0 ${isFirst ? 'text-amber-400' : 'text-slate-500'}`}>{index + 1}</span>
              <span className={`font-bold text-base truncate ${isAlive ? (p.teamColor || 'text-white') : 'text-slate-400'}`}>{p.team ? `[${p.team}] ` : ''}{p.name}</span>
            </div>
            <div className="text-right shrink-0 ml-4 flex items-center gap-2">
              {isLowHp && <span className="text-red-500 animate-bounce"><ShieldAlert size={14} /></span>}
              {isAlive ? <span className={`font-black text-sm px-3 py-1.5 rounded-xl border tabular-nums ${isLowHp ? 'bg-red-500/20 text-red-500 border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>HP {p.hp}</span> : <span className="text-slate-500 font-bold text-xs px-3 py-1.5 bg-slate-800/40 rounded-xl border border-slate-800/50">T{p.turn}脱落</span>}
            </div>
          </div>
        );
      })}
    </div>
  );

  const onDragStart = (e: React.DragEvent, player: Player | ManualPlayer) => { setDraggedPlayer(player); e.dataTransfer.setData("playerName", player.name); };
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (e: React.DragEvent, teamIndex: number) => { e.preventDefault(); if (draggedPlayer && !isMultiplayer) { updatePlayerTeam(draggedPlayer.name, teamIndex); setDraggedPlayer(null); } };
  const onDropLobby = async (e: React.DragEvent, teamIndex: number) => {
    e.preventDefault();
    if (draggedPlayer && isMultiplayer && user?.uid === roomHostId && db && currentRoomId) {
      try {
        const updated = players.map(p => (p as Player).id === (draggedPlayer as Player).id ? { ...p, teamIndex, team: teamNames[teamIndex] } : p);
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', currentRoomId), { players: updated });
      } catch (err) {
        console.error("Lobby onDrop failed", err);
      }
      setDraggedPlayer(null);
    }
  };
  const onTouchStart = (e: React.TouchEvent, player: Player | ManualPlayer) => setDraggedPlayer(player);
  const onTouchMove = (e: React.TouchEvent) => {
    if (!draggedPlayer) return;
    const touch = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const teamBox = target?.closest('[data-team-index]');
    if (teamBox) setTouchTargetTeam(parseInt(teamBox.getAttribute('data-team-index') || '0'));
    else setTouchTargetTeam(null);
  };
  const onTouchEnd = () => { if (draggedPlayer && touchTargetTeam !== null && !isMultiplayer) updatePlayerTeam(draggedPlayer.name, touchTargetTeam); setDraggedPlayer(null); setTouchTargetTeam(null); };
  const onTouchEndLobby = async () => {
    if (draggedPlayer && touchTargetTeam !== null && isMultiplayer && user?.uid === roomHostId && db && currentRoomId) {
      try {
        const updated = players.map(p => (p as Player).id === (draggedPlayer as Player).id ? { ...p, teamIndex: touchTargetTeam, team: teamNames[touchTargetTeam] } : p);
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', currentRoomId), { players: updated });
      } catch (err) {
        console.error("Lobby touchEnd failed", err);
      }
    }
    setDraggedPlayer(null); setTouchTargetTeam(null);
  };

  if (phase === 'home') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="z-10 text-center max-w-xl w-full">
          <div className="mb-4 inline-block p-4 bg-indigo-900/50 rounded-3xl border border-indigo-500/30"><Swords size={48} className="text-indigo-400" /></div>
          <h1 className="text-5xl md:text-7xl font-black italic tracking-tighter text-white drop-shadow-2xl mb-12 uppercase leading-none">Survival<br /><span className="text-indigo-400">Roulette</span></h1>
          <div className="flex flex-col gap-4">
            <button onClick={() => { setIsMultiplayer(false); setPhase('setup'); }} className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-2xl transition-all shadow-[0_0_30px_rgba(79,70,229,0.4)] flex items-center justify-center gap-3"><Users size={24} /> ひとりで遊ぶ</button>
            <button onClick={() => setPhase('multi_menu')} className="w-full py-5 bg-slate-900 border-2 border-slate-700 hover:border-indigo-500 hover:bg-slate-800 text-slate-300 hover:text-white rounded-2xl font-black text-2xl transition-all flex items-center justify-center gap-3"><Activity size={24} /> みんなで遊ぶ</button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'multi_menu') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md bg-slate-900 rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl flex flex-col items-center text-center">
          <h2 className="text-3xl font-black italic tracking-tighter text-indigo-400 mb-8 uppercase">Multiplayer</h2>
          <div className="flex flex-col gap-4 w-full">
            <button onClick={() => { setIsMultiplayer(true); setPhase('setup'); }} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xl transition-all">マルチプレイルーム作成</button>
            <button onClick={() => { setIsMultiplayer(true); setPhase('multi_join_id'); }} className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black text-xl transition-all">ID入室</button>
          </div>
          <button onClick={() => setPhase('home')} className="mt-8 text-slate-500 font-bold hover:text-white transition-colors">← 戻る</button>
        </div>
      </div>
    );
  }

  if (phase === 'multi_join_id') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md bg-slate-900 rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl text-center">
          <h2 className="text-2xl font-black italic tracking-tighter text-white mb-2 uppercase">JOIN ROOM</h2>
          <p className="text-slate-400 text-xs font-bold mb-6">共有されたルームIDを入力してください</p>
          <input type="text" value={joinRoomIdInput} onChange={(e) => setJoinRoomIdInput(e.target.value)} placeholder="ROOM ID" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-4 font-black text-2xl mb-2 outline-none focus:border-indigo-500 text-center uppercase tracking-widest text-indigo-400" maxLength={6} />
          {joinError && <div className="text-red-500 text-xs font-bold mb-4">{joinError}</div>}
          <button onClick={handleJoinRoomStep1} disabled={!joinRoomIdInput.trim()} className={`w-full mt-4 py-4 rounded-xl font-black text-xl transition-all ${joinRoomIdInput.trim() ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500'}`}>次へ</button>
          <button onClick={() => setPhase('multi_menu')} className="mt-6 text-slate-500 font-bold hover:text-white transition-colors">キャンセル</button>
        </div>
      </div>
    );
  }

  if (phase === 'multi_name') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md bg-slate-900 rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl text-center">
          <h2 className="text-2xl font-black italic tracking-tighter text-white mb-2 uppercase">YOUR NAME</h2>
          <p className="text-slate-400 text-xs font-bold mb-6">ゲーム内で表示される名前を入力してください</p>
          <input type="text" value={playerNameInput} onChange={(e) => setPlayerNameInput(e.target.value)} placeholder="Player Name" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-4 font-bold text-lg mb-6 outline-none focus:border-indigo-500 text-center text-white" maxLength={15} />
          <button onClick={handleJoinRoomFinal} disabled={!playerNameInput.trim()} className={`w-full py-4 rounded-xl font-black text-xl transition-all ${playerNameInput.trim() ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500'}`}>入室する</button>
        </div>
      </div>
    );
  }

  if (phase === 'multi_lobby') {
    const isHost = user?.uid === roomHostId;
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 flex flex-col items-center justify-center">
        <div className="bg-slate-900 rounded-[3rem] shadow-2xl border border-slate-800 w-full max-w-4xl p-6 md:p-10 flex flex-col h-[85vh]">
          <div className="text-center mb-6 shrink-0 relative">
            <div className="absolute top-0 left-0 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1"><Activity size={12} /> MULTIPLAYER</div>
            <h2 className="text-4xl font-black italic tracking-tighter text-white mt-4 md:mt-0 mb-4 uppercase">WAITING LOBBY</h2>
            <div className="inline-flex items-center gap-4 bg-slate-950 border border-slate-800 px-6 py-3 rounded-2xl mx-auto">
              <span className="text-slate-500 font-black text-xs uppercase tracking-widest">Room ID</span>
              <span className="text-3xl font-black text-indigo-400 tracking-widest">{currentRoomId}</span>
              <button onClick={() => copyToClipboard(currentRoomId || '', setIsLogsCopied)} className="p-2.5 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors">{isLogsCopied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}</button>
            </div>
          </div>

          <div className="text-[10px] font-black text-slate-500 tracking-widest uppercase mb-3 flex justify-between items-end"><span className="flex items-center gap-2"><Users size={14} /> 参加プレイヤー ({players.length})</span>{isHost && mode === 'team' && <span className="text-amber-500">ドラッグ＆ドロップでチーム変更可能</span>}</div>

          <div className="flex-1 overflow-y-auto custom-scrollbar border border-slate-800 rounded-3xl p-4 bg-slate-950 mb-6" onTouchMove={onTouchMove} onTouchEnd={onTouchEndLobby}>
            {mode === 'individual' ? (
              <div className="flex flex-wrap gap-3">
                {players.map((p) => (
                  <div key={p.id} className={`px-5 py-3 rounded-xl border font-bold text-sm flex items-center gap-3 ${p.uid === roomHostId ? 'bg-indigo-900/30 border-indigo-500/50 text-indigo-100' : 'bg-slate-900 border-slate-800 text-slate-200'}`}>
                    {p.uid === roomHostId ? <Trophy size={14} className="text-amber-400" /> : <Users size={14} className="text-slate-500" />} {p.name}
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: teamCount }).map((_, teamIdx) => (
                  <div
                    key={teamIdx} data-team-index={teamIdx} onDragOver={onDragOver} onDrop={(e) => onDropLobby(e, teamIdx)}
                    className={`p-4 rounded-2xl border transition-all ${touchTargetTeam === teamIdx ? 'bg-indigo-600/20 border-indigo-500 ring-2 ring-indigo-500/30' : 'bg-slate-900 border-slate-800'}`}
                  >
                    <h4 className="text-sm font-black text-indigo-400 uppercase tracking-widest mb-3">{teamNames[teamIdx] || `チーム${String.fromCharCode(65 + teamIdx)}`}</h4>
                    <div className="min-h-[120px] flex flex-wrap gap-2 content-start">
                      {players.filter(p => p.teamIndex === teamIdx).map(p => (
                        <div
                          key={p.id} draggable={isHost} onDragStart={(e) => onDragStart(e, p)} onTouchStart={(e) => onTouchStart(e, p)}
                          className={`bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800 font-bold text-sm flex items-center gap-2 ${isHost ? 'cursor-grab active:cursor-grabbing hover:border-slate-600 shadow-sm' : ''} ${p.uid === roomHostId ? 'text-indigo-300' : 'text-slate-200'}`}
                        >
                          {isHost && <GripVertical size={14} className="text-slate-600" />} {p.uid === roomHostId && <Trophy size={12} className="text-amber-400" />} {p.name}
                        </div>
                      ))}
                      {players.filter(p => p.teamIndex === teamIdx).length === 0 && <div className="text-[10px] font-black text-slate-700 uppercase italic py-2 w-full text-center">Empty</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 text-center">
            {isHost ? (
              <button onClick={startMultiplayerGame} disabled={players.length < 2} className={`w-full max-w-md mx-auto py-5 rounded-2xl font-black text-2xl transition-all shadow-2xl flex items-center justify-center gap-3 ${players.length >= 2 ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/30' : 'bg-slate-800 text-slate-600 border border-slate-700'}`}>
                {players.length >= 2 ? <><Play fill="currentColor" /> ゲームスタート</> : '参加者を待っています...'}
              </button>
            ) : (
              <div className="bg-slate-800 border border-slate-700 w-full max-w-md mx-auto py-5 rounded-2xl font-black text-lg text-slate-400 flex items-center justify-center gap-3 animate-pulse">
                <Clock size={20} /> ホストの開始を待機中...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'setup') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 flex items-center justify-center">
        <div className="w-full max-w-5xl bg-slate-900 rounded-[2.5rem] shadow-2xl border border-slate-800 overflow-hidden">
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-6 text-center relative overflow-hidden shrink-0 flex justify-between items-center">
            {isMultiplayer && <div className="bg-black/20 px-3 py-1 rounded text-[10px] font-black text-indigo-100 uppercase tracking-widest">Multiplayer Mode</div>}
            <h1 className="text-2xl md:text-3xl font-black italic tracking-tighter text-white drop-shadow-lg uppercase flex-1 text-center">SURVIVAL ROULETTE</h1>
            {isMultiplayer && <div className="w-[100px]"></div>}
          </div>

          <div className={`p-6 grid grid-cols-1 ${isMultiplayer ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-6 lg:h-[78vh] overflow-y-auto lg:overflow-hidden custom-scrollbar`}>
            {/* 左側設定カラム */}
            <div className="space-y-4 flex flex-col min-h-0 lg:h-full overflow-hidden">
              <div className={`space-y-4 overflow-y-auto pr-1 custom-scrollbar shrink-0 ${isMultiplayer ? 'h-full' : 'max-h-[60%] lg:max-h-[65%]'}`}>
                <label className="text-[10px] font-black text-slate-500 tracking-widest uppercase flex items-center gap-2 px-1"><Settings2 size={12} /> 基本設定</label>
                <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                  <label className="text-[8px] font-black text-slate-500 tracking-widest block uppercase flex items-center gap-1"><Type size={8} /> タイトル</label>
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ゲームのタイトルを入力..." className="bg-transparent text-sm font-bold w-full outline-none text-white border-b border-slate-800 focus:border-indigo-500 pb-1" />
                  <div className="flex gap-1 pt-2">
                    {['individual', 'team'].map(m => (
                      <button key={m} onClick={() => setMode(m)} className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all ${mode === m ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-500 hover:text-slate-300'}`}>{m === 'individual' ? '個人戦' : 'チーム戦'}</button>
                    ))}
                  </div>
                </div>
                {mode === 'team' && (
                  <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 shadow-inner space-y-3">
                    <div>
                      <label className="text-[8px] font-black text-slate-500 tracking-widest block mb-1 uppercase">チーム数</label>
                      <input type="number" min="2" max="6" value={teamCount} onChange={(e) => setTeamCount(parseInt(e.target.value) || 2)} className="bg-transparent text-xl font-black w-full outline-none text-indigo-400 tabular-nums" />
                    </div>
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <label className="text-[8px] font-black text-slate-500 tracking-widest block mb-1 uppercase flex items-center gap-1"><Edit3 size={8} /> チーム名設定</label>
                      <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                        {Array.from({ length: teamCount }).map((_, i) => (
                          <input key={i} type="text" value={teamNames[i] || ''} onChange={(e) => updateTeamName(i, e.target.value)} placeholder={`チーム${String.fromCharCode(65 + i)}`} className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-300 outline-none focus:border-indigo-500" />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800"><label className="text-[8px] font-black text-slate-500 block mb-1 uppercase">初期HP</label><input type="number" value={initialHP} onChange={(e) => setInitialHP(Math.max(1, parseInt(e.target.value) || 1))} className="bg-transparent text-lg font-black w-full outline-none text-indigo-400" /></div>
                  <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800"><label className="text-[8px] font-black text-slate-500 block mb-1 uppercase">速度 (秒)</label><input type="number" step="0.1" value={spinDuration} onChange={(e) => setSpinDuration(Math.max(0.1, parseFloat(e.target.value) || 0.1))} className="bg-transparent text-lg font-black w-full outline-none text-amber-500" /></div>
                </div>
                <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800"><label className="text-[8px] font-black text-slate-500 block mb-1 uppercase">回復頻度 (ターン)</label><input type="number" value={healInterval} onChange={(e) => setHealInterval(Math.max(1, parseInt(e.target.value) || 1))} className="bg-transparent text-lg font-black w-full outline-none text-emerald-500" /></div>
                <div className="space-y-2">
                  <button onClick={() => setIsHpBalanceEnabled(!isHpBalanceEnabled)} className={`w-full p-3 rounded-2xl border flex items-center justify-between transition-all ${isHpBalanceEnabled ? 'bg-emerald-600/10 border-emerald-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
                    <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Scale size={14} /> HPバランス調整</span>
                    <div className={`px-2 py-0.5 rounded text-[8px] font-black ${isHpBalanceEnabled ? 'bg-emerald-600' : 'bg-slate-800'}`}>{isHpBalanceEnabled ? 'ON' : 'OFF'}</div>
                  </button>
                  <button onClick={() => setIsSpecialEventEnabled(!isSpecialEventEnabled)} className={`w-full p-3 rounded-2xl border flex items-center justify-between transition-all ${isSpecialEventEnabled ? 'bg-purple-600/10 border-purple-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
                    <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">{isSpecialEventEnabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />} 特別イベント</span>
                    <div className={`px-2 py-0.5 rounded text-[8px] font-black ${isSpecialEventEnabled ? 'bg-purple-600' : 'bg-slate-800'}`}>{isSpecialEventEnabled ? 'ON' : 'OFF'}</div>
                  </button>
                  {isSpecialEventEnabled && (
                    <div className="mt-2 space-y-3 ml-4 border-l-2 border-purple-500/20 pl-4 py-2">
                      <div className="p-3 bg-slate-950/50 rounded-2xl border border-purple-500/30 flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase">発生確率</span>
                        <div className="flex items-center gap-1 bg-purple-500/10 px-2 py-1 rounded-lg">
                          <input type="number" min="1" max="100" value={specialEventProb} onChange={(e) => setSpecialEventProb(Number(e.target.value))} onBlur={handleSpecialEventProbComplete} onKeyDown={handleSpecialEventProbComplete} className="bg-transparent text-[10px] font-black w-8 outline-none text-purple-400 text-right tabular-nums" />
                          <span className="text-[8px] font-black text-purple-400">%</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {[
                          { id: 'reverseMode', label: 'リバース (以外全員)', icon: <RotateCcw size={10} /> }, { id: 'multiMode', label: 'マルチ (複数名同時)', icon: <Users size={10} /> },
                          { id: 'feint', label: 'ルーレットフェイント', icon: <Zap size={10} /> }, { id: 'diceMode', label: `ダイスルーレット (${diceConfig.min}d-${diceConfig.max}d)`, icon: <Percent size={10} /> },
                          { id: 'numberFormat', label: '特殊数値形式', icon: <Type size={10} /> }, { id: 'nameTranslation', label: '名前の多言語化', icon: <Languages size={10} /> },
                          { id: 'reverseHealDamage', label: '回復・ダメージ逆転', icon: <RotateCcw size={10} /> }, { id: 'instantDeath', label: '脱落イベント (即死)', icon: <Skull size={10} /> },
                          { id: 'trueRandom', label: '完全ランダム (HPバランス無視)', icon: <Activity size={10} /> }
                        ].map(ev => (
                          <div key={ev.id} className="flex flex-col">
                            <button onClick={() => toggleSpecialEvent(ev.id)} className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${enabledSpecialEvents.includes(ev.id) ? 'bg-purple-600/20 border-purple-500/50 text-purple-100' : 'bg-slate-900 border-slate-800 text-slate-600'} ${enabledSpecialEvents.includes(ev.id) && ['diceMode', 'numberFormat', 'nameTranslation'].includes(ev.id) ? 'rounded-b-none border-b-0' : ''}`}>
                              <span className="text-[9px] font-bold flex items-center gap-2">{ev.icon} {ev.label}</span>
                              <div className={`w-2 h-2 rounded-full ${enabledSpecialEvents.includes(ev.id) ? 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]' : 'bg-slate-700'}`}></div>
                            </button>
                            {enabledSpecialEvents.includes(ev.id) && ev.id === 'diceMode' && (
                              <div className="pl-4 pr-2 py-2 bg-slate-900/50 rounded-b-xl border border-purple-500/50 border-t-0 flex items-center gap-2">
                                <span className="text-[9px] text-slate-400">範囲:</span><input type="number" value={diceConfig.min} onChange={e => setDiceConfig({ ...diceConfig, min: parseInt(e.target.value) || 1 })} className="w-12 bg-slate-950 border border-slate-800 rounded px-1 text-[10px] text-white" /><span className="text-slate-400 text-[10px]">d ~</span><input type="number" value={diceConfig.max} onChange={e => setDiceConfig({ ...diceConfig, max: parseInt(e.target.value) || 1 })} className="w-12 bg-slate-950 border border-slate-800 rounded px-1 text-[10px] text-white" /><span className="text-slate-400 text-[10px]">d</span>
                              </div>
                            )}
                            {enabledSpecialEvents.includes(ev.id) && ev.id === 'numberFormat' && (
                              <div className="pl-3 pr-2 py-2 bg-slate-900/50 rounded-b-xl border border-purple-500/50 border-t-0 grid grid-cols-2 gap-y-1.5 gap-x-1 max-h-40 overflow-y-auto custom-scrollbar">
                                {ALL_NUMBER_FORMATS.map(fmt => (
                                  <label key={fmt.id} className="flex items-center gap-1.5 text-[9px] text-slate-300 cursor-pointer"><input type="checkbox" checked={enabledFormats.includes(fmt.id)} onChange={() => setEnabledFormats(prev => prev.includes(fmt.id) ? prev.filter(id => id !== fmt.id) : [...prev, fmt.id])} className="accent-purple-500 w-3 h-3 shrink-0" /><span className="truncate">{fmt.label}</span></label>
                                ))}
                              </div>
                            )}
                            {enabledSpecialEvents.includes(ev.id) && ev.id === 'nameTranslation' && (
                              <div className="pl-3 pr-2 py-2 bg-slate-900/50 rounded-b-xl border border-purple-500/50 border-t-0 grid grid-cols-2 gap-y-1.5 gap-x-1 max-h-40 overflow-y-auto custom-scrollbar">
                                {ALL_LANGUAGES.map(lang => (
                                  <label key={lang} className="flex items-center gap-1.5 text-[9px] text-slate-300 cursor-pointer"><input type="checkbox" checked={enabledLangs.includes(lang)} onChange={() => setEnabledLangs(prev => prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang])} className="accent-purple-500 w-3 h-3 shrink-0" /><span className="truncate">{lang}</span></label>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!isMultiplayer && (
                    <button onClick={() => setIsManualModeEnabled(!isManualModeEnabled)} className={`w-full p-3 rounded-2xl border flex items-center justify-between transition-all ${isManualModeEnabled ? 'bg-amber-600/10 border-amber-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
                      <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Hand size={14} /> 手動選択 (41-60T)</span>
                      <div className={`px-2 py-0.5 rounded text-[8px] font-black ${isManualModeEnabled ? 'bg-amber-600' : 'bg-slate-800'}`}>{isManualModeEnabled ? 'ON' : 'OFF'}</div>
                    </button>
                  )}
                </div>
              </div>

              {!isMultiplayer && (
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden pt-2 border-t border-slate-800">
                  <label className="text-[10px] font-black text-slate-500 tracking-widest block mb-2 uppercase flex items-center gap-2 px-1"><Users size={12} /> プレイヤーリスト</label>
                  <textarea value={playerListText} onChange={(e) => setPlayerListText(e.target.value)} placeholder="名前を改行で入力..." className="flex-1 w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm custom-scrollbar resize-none" />
                </div>
              )}
            </div>

            {/* シングル時のチーム分けカラム */}
            {!isMultiplayer && (
              <div className="space-y-4 flex flex-col min-h-[500px] lg:min-h-0 lg:h-full overflow-hidden">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[10px] font-black text-slate-500 tracking-widest uppercase flex items-center gap-2"><UserPlus size={12} /> {mode === 'team' ? 'チーム分け (ドラッグ可能)' : '参加者確認'}</label>
                  {mode === 'team' && <button onClick={autoAssignTeams} className="text-[8px] font-black px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-all uppercase">自動振分</button>}
                </div>

                <div className="flex-1 bg-slate-950 rounded-2xl border border-slate-800 p-2 overflow-y-auto custom-scrollbar space-y-4" onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
                  {mode === 'individual' ? (
                    manualPlayers.length === 0 ? <p className="text-[10px] text-slate-600 font-bold text-center mt-10 uppercase italic">名前を入力してください</p> : manualPlayers.map((p, idx) => (<div key={idx} className="flex items-center gap-2 bg-slate-900 p-2 rounded-xl border border-slate-800/50"><div className="flex-1 truncate text-xs font-bold px-1">{p.name}</div></div>))
                  ) : (
                    <div className="space-y-4">
                      {Array.from({ length: teamCount }).map((_, teamIdx) => (
                        <div key={teamIdx} data-team-index={teamIdx} onDragOver={onDragOver} onDrop={(e) => onDrop(e, teamIdx)} className={`p-3 rounded-2xl border transition-all ${touchTargetTeam === teamIdx ? 'bg-indigo-600/20 border-indigo-500 ring-2 ring-indigo-500/30' : 'bg-slate-900/50 border-slate-800'}`}>
                          <h4 className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2 px-1">{teamNames[teamIdx] || `チーム${String.fromCharCode(65 + teamIdx)}`}</h4>
                          <div className="min-h-[40px] flex flex-wrap gap-2">
                            {manualPlayers.filter(p => p.teamIndex === teamIdx).length === 0 ? <div className="w-full text-center py-2 text-[8px] text-slate-700 font-bold uppercase italic">No Members</div> : manualPlayers.filter(p => p.teamIndex === teamIdx).map((p) => (
                              <div key={p.name} draggable onDragStart={(e) => onDragStart(e, p)} onTouchStart={(e) => onTouchStart(e, p)} className={`flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 cursor-grab active:cursor-grabbing hover:border-slate-600 transition-colors shadow-sm ${draggedPlayer?.name === p.name ? 'opacity-50 border-indigo-500' : ''}`}><GripVertical size={10} className="text-slate-600" /><span className="text-[10px] font-bold text-slate-300 pointer-events-none">{p.name}</span></div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 右側ルール設定カラム */}
            <div className={`space-y-6 flex flex-col min-h-[500px] lg:min-h-0 lg:h-full overflow-hidden ${isMultiplayer ? 'pb-20' : ''}`}>
              <div className="space-y-4 flex-1 overflow-y-auto pr-1 custom-scrollbar min-h-0">
                <div className="space-y-3">
                  <div className="flex items-center justify-between"><label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2"><Percent size={12} /> ルーレット構成</label><button onClick={addFixedItem} className="p-1.5 bg-indigo-600 rounded-lg text-white"><Plus size={14} /></button></div>
                  <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400">ランダム範囲</span>
                      <div className="flex items-center gap-1 bg-indigo-500/10 px-2 py-1 rounded-lg"><input type="number" value={config.rangeProb} onChange={(e) => setConfig({ ...config, rangeProb: Number(e.target.value) })} onBlur={(e) => handleConfigComplete(e, 'rangeProb', 0)} onKeyDown={(e) => handleConfigComplete(e, 'rangeProb', 0)} className="bg-transparent text-[10px] font-black w-6 outline-none text-indigo-400 text-right" /><span className="text-[8px] font-black text-indigo-400">%</span></div>
                    </div>
                    <div className="flex items-center gap-2"><input type="number" value={config.rangeMin} onChange={(e) => setConfig({ ...config, rangeMin: Number(e.target.value) })} onBlur={(e) => handleConfigComplete(e, 'rangeMin', 1)} onKeyDown={(e) => handleConfigComplete(e, 'rangeMin', 1)} className="w-full bg-slate-900 p-2 rounded-xl text-center font-black text-xs border border-slate-800" /><span className="text-slate-700">~</span><input type="number" value={config.rangeMax} onChange={(e) => setConfig({ ...config, rangeMax: Number(e.target.value) })} onBlur={(e) => handleConfigComplete(e, 'rangeMax', 1)} onKeyDown={(e) => handleConfigComplete(e, 'rangeMax', 1)} className="w-full bg-slate-900 p-2 rounded-xl text-center font-black text-xs border border-slate-800" /></div>
                  </div>
                  {config.fixedItems.map(item => (
                    <div key={item.id} className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex items-center gap-2">
                      <input type="number" value={item.value} onChange={(e) => updateFixedItemValue(item.id, 'value', e.target.value)} onBlur={(e) => handleFixedItemComplete(e, item.id, 'value', 1)} onKeyDown={(e) => handleFixedItemComplete(e, item.id, 'value', 1)} className="w-16 bg-slate-900 p-2 rounded-xl text-center font-black text-xs border border-slate-800" />
                      <div className="flex-1 flex items-center gap-1 bg-slate-900 p-2 rounded-xl border border-slate-800"><input type="number" value={item.prob} onChange={(e) => updateFixedItemValue(item.id, 'prob', e.target.value)} onBlur={(e) => handleFixedItemComplete(e, item.id, 'prob', 0)} onKeyDown={(e) => handleFixedItemComplete(e, item.id, 'prob', 0)} className="w-full bg-transparent text-[10px] font-black text-right outline-none text-indigo-400" /><span className="text-[8px] text-slate-500">%</span></div>
                      <button onClick={() => removeFixedItem(item.id)} className="p-2 text-red-500"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
                <div className="space-y-3 pt-4 border-t border-slate-800">
                  <div className="flex items-center justify-between"><label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2"><ShieldAlert size={12} /> 復活設定</label><button onClick={addReviveEvent} className="p-1.5 bg-purple-600 rounded-lg text-white"><Plus size={14} /></button></div>
                  {reviveEvents.map(rev => (
                    <div key={rev.id} className="p-3 bg-slate-950 rounded-2xl border border-purple-900/30 flex items-center gap-2">
                      <input type="number" value={rev.turn} onChange={(e) => updateReviveEventState(rev.id, 'turn', e.target.value)} className="w-14 bg-slate-900 p-2 rounded-xl text-center font-black text-xs border border-slate-800 text-purple-400" />
                      <div className="flex-1 flex gap-1">{(['steal', 'copy'] as const).map(t => (<button key={t} onClick={() => updateReviveEventState(rev.id, 'type', t)} className={`flex-1 py-1.5 rounded-lg text-[8px] font-bold ${rev.type === t ? 'bg-purple-600 text-white' : 'bg-slate-900 text-slate-600'}`}>{t === 'steal' ? '奪う' : 'コピー'}</button>))}</div>
                      <button onClick={() => removeReviveEvent(rev.id)} className="text-slate-600"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              </div>

              {isMultiplayer ? (
                <div className="absolute bottom-6 right-6 left-6 lg:left-[51%]">
                  <button onClick={handleCreateRoom} disabled={totalProb !== 100} className={`w-full py-5 rounded-2xl font-black text-xl transition-all active:scale-95 flex items-center justify-center gap-3 text-white ${totalProb === 100 ? 'bg-indigo-600 hover:bg-indigo-500 shadow-xl shadow-indigo-500/20' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>ルーム作成 (次へ)</button>
                </div>
              ) : (
                <div className="shrink-0 pt-2">
                  <button onClick={startGameSingle} disabled={totalProb !== 100 || manualPlayers.length < 2} className={`w-full py-5 rounded-2xl font-black text-xl transition-all active:scale-95 flex items-center justify-center gap-3 text-white ${totalProb === 100 && manualPlayers.length >= 2 ? 'bg-indigo-600 hover:bg-indigo-500 shadow-xl shadow-indigo-500/20' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}><Play fill="currentColor" size={24} /> BATTLE START</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'result') {
    const combinedRanking = getCombinedRanking();
    const alivePlayers = players.filter(p => p.status === 'alive');
    const hasWinner = alivePlayers.length > 0;
    const isTeamMode = mode === 'team';

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 flex flex-col items-center justify-center max-w-[1200px] mx-auto w-full">
        <div className="w-full bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 md:p-10 shadow-2xl flex flex-col gap-6">
          <div className="text-center relative">
            <div className="inline-block p-4 bg-indigo-900/30 rounded-3xl border border-indigo-500/20 mb-3 text-indigo-400">
              <Trophy size={36} className="text-amber-400 animate-bounce" />
            </div>
            <h1 className="text-3xl md:text-5xl font-black italic uppercase tracking-tighter text-white">RESULT</h1>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">生存競争、決着</p>
          </div>

          <div className="bg-slate-950 border border-slate-800/80 rounded-3xl p-6 text-center max-w-lg mx-auto w-full">
            <div className="text-[10px] font-black text-indigo-400 tracking-[0.2em] uppercase mb-1">WINNER</div>
            {hasWinner ? (
              <div>
                <div className="text-2xl md:text-3xl font-black text-amber-400 mb-1">
                  {isTeamMode ? `${alivePlayers[0].team}` : `${alivePlayers[0].name}`}
                </div>
                <div className="text-slate-400 text-xs font-bold">
                  第{turn}ターンを耐え抜き、勝利を掴み取った！
                </div>
              </div>
            ) : (
              <div className="text-slate-500 font-bold text-lg">勝者なし (全員脱落)</div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start min-h-0 md:h-[500px] w-full">
            <div className="bg-slate-950 border border-slate-800/60 rounded-3xl p-4 flex flex-col h-[350px] md:h-full overflow-hidden w-full">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 px-1 flex items-center gap-2 shrink-0">
                <Trophy size={14} className="text-amber-500" /> 最終順位
              </label>
              <RankingList ranking={combinedRanking} />
            </div>

            <div className="flex flex-col gap-4 h-[400px] md:h-full w-full overflow-hidden">
              <div className="bg-slate-950 border border-slate-800/60 rounded-3xl p-4 flex flex-col justify-center gap-2 shrink-0">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 px-1">結果を出力する</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={copyRanking} className="p-3 bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-850 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all">
                    {isRankingCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />} 通常テキスト
                  </button>
                  <button onClick={copyDiscordRanking} className="p-3 bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-850 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all">
                    {isDiscordCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />} Discord形式
                  </button>
                  <button onClick={copyLogs} className="p-3 bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-850 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all col-span-2">
                    {isLogsCopied ? <Check size={14} className="text-emerald-400" /> : <History size={14} />} ターンログをコピー
                  </button>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800/60 rounded-3xl p-4 flex-1 flex flex-col overflow-hidden min-h-0">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1 shrink-0">ログ一覧</label>
                <div className="overflow-y-auto flex-1 space-y-1.5 pr-1 custom-scrollbar">
                  {logs.slice(0, 50).map((log) => (
                    <div key={log.id} className="text-[11px] font-bold text-slate-400 flex items-start gap-2 py-0.5 border-b border-slate-900/40">
                      <span className="text-slate-600 shrink-0">T{log.turn}:</span>
                      <span className="line-clamp-2 text-slate-300">{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-4 mt-2">
            <button onClick={backToHome} className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white font-black text-lg rounded-2xl border border-slate-700 hover:border-slate-500 transition-all flex items-center justify-center gap-2">
              <RotateCcw size={18} /> ホームに戻る
            </button>
            <button onClick={isMultiplayer ? startMultiplayerGame : startGameSingle} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-lg rounded-2xl shadow-xl shadow-indigo-500/10 transition-all flex items-center justify-center gap-2">
              <Play fill="currentColor" size={18} /> もう一度遊ぶ
            </button>
          </div>
        </div>
      </div>
    );
  }

  const nextEvent = (() => {
    const nextRevive = reviveEvents.filter(r => r.turn >= turn).sort((a, b) => a.turn - b.turn)[0];
    const nextHeal = Math.ceil(turn / healInterval) * healInterval;
    const list: { name: string; val: number }[] = [];
    if (nextRevive) list.push({ name: `${nextRevive.turn}T:復活`, val: nextRevive.turn });
    if (nextHeal > turn) list.push({ name: `${nextHeal}T:回復`, val: nextHeal });
    if (list.length === 0) return { name: "最終決戦", remaining: "-" };
    const nearest = list.sort((a, b) => a.val - b.val)[0];
    return { name: nearest.name, remaining: nearest.val - turn };
  })();

  const survivorsSorted = players.filter(p => p.status === 'alive').sort((a, b) => b.hp - a.hp);
  const totalSurvivorHp = survivorsSorted.reduce((sum, p) => sum + p.hp, 0);
  const isHost = isMultiplayer ? (user?.uid === roomHostId) : true;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 flex flex-col md:flex-row gap-6 max-w-[1500px] mx-auto font-sans md:overflow-hidden md:h-screen">
      <div className="flex-1 flex flex-col gap-6 md:overflow-hidden md:h-full">
        <div className="bg-slate-900 rounded-3xl p-6 border-b-4 border-indigo-600 flex justify-between items-center shadow-2xl shrink-0">
          <div className="flex items-center gap-5 truncate">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center font-black text-2xl text-white tabular-nums shrink-0">{turn}</div>
            <div className="truncate">
              <div className="text-indigo-400 font-black text-[11px] tracking-widest uppercase truncate">{title}</div>
              <div className="text-xl font-black italic text-white truncate">{isReviveTurn ? 'SPECIAL EVENT' : isHealTurn ? 'HEALING TIME' : 'BATTLE ROUND'}</div>
            </div>
          </div>
          <div className="text-right px-5 py-3 bg-slate-950 rounded-2xl border border-slate-800 shrink-0">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{nextEvent.name}まで</div>
            <div className="text-base font-black text-amber-500 italic">{nextEvent.remaining === "-" ? "CLIMAX" : `${nextEvent.remaining} TURN`}</div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-[3rem] p-8 border border-slate-800 flex flex-col items-center justify-center relative flex-1 shrink-0 overflow-hidden min-h-[350px]">
          <div className="absolute top-8 right-10 flex flex-col items-end gap-2 z-10">
            {isReviveTurn ? <div className="bg-purple-600 text-white px-5 py-2 rounded-xl text-sm font-black animate-pulse flex items-center gap-2"><Sparkles size={16} /> REVIVE</div> : isHealTurn ? <div className="bg-emerald-600 text-white px-5 py-2 rounded-xl text-sm font-black flex items-center gap-2"><Heart size={16} fill="currentColor" /> HEAL</div> : <div className="bg-slate-950 text-red-500 border border-red-900/40 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-[0.2em]">Battle Phase</div>}
            {(lastResult?.isReverse || lastResult?.isMulti) && <div className="bg-amber-600 text-white px-3 py-1 rounded-lg text-[10px] font-black animate-bounce">SPECIAL EVENT!</div>}
          </div>

          <div className="absolute top-8 left-10 flex flex-col gap-2 z-10">
            {isMultiplayer && <div className="bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Activity size={14} /> ONLINE</div>}
            {isHpBalanceEnabled && <div className="bg-emerald-600/20 text-emerald-500 border border-emerald-500/30 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Scale size={14} /> BALANCED MODE</div>}
            {isSpecialEventEnabled && numberFormat !== 'default' && <div className="bg-amber-600/20 text-amber-500 border border-amber-500/30 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest animate-pulse flex items-center gap-2"><RotateCcw size={14} /> {numberFormat.toUpperCase()} MODE</div>}
            {isSpecialEventEnabled && nameLanguage !== 'default' && <div className="bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest animate-pulse flex items-center gap-2"><Languages size={14} /> {nameLanguage} MODE</div>}
          </div>

          <div className="text-center w-full px-6 relative z-10 flex flex-col items-center">
            <div className={`text-3xl md:text-5xl lg:text-6xl font-black mb-6 tracking-tighter italic truncate max-w-full ${lastResult?.isReverse || lastResult?.isMulti ? 'text-amber-400' : 'text-white'}`}>{displayResult.player}</div>
            <div className={`text-[5rem] md:text-[8rem] lg:text-[9rem] font-black leading-none transition-all duration-75 tabular-nums break-all ${isSpinning ? 'text-slate-800 scale-95 blur-[2px]' : (lastResult?.type === 'heal' || lastResult?.type === 'revive' ? 'text-emerald-400' : 'text-red-600')}`}>
              {displayResult.amount}
            </div>
          </div>

          <div className="mt-10 w-full max-w-[320px] relative z-10">
            {isManualSelectionPhase ? (
              <div className="space-y-4 w-full">
                <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest text-center animate-pulse">対象を選択してください（未選択でスキップ）</div>
                <button onClick={applyManualSelection} className="w-full py-6 rounded-[2rem] font-black text-2xl shadow-2xl transition-all active:scale-95 border-b-[10px] flex items-center justify-center gap-4 bg-indigo-600 border-indigo-900 text-white hover:brightness-110"><Zap size={24} fill="currentColor" /> {selectedPlayerIds.length > 0 ? `APPLY (${selectedPlayerIds.length})` : 'SKIP THIS ROUND'}</button>
              </div>
            ) : (
              <button onClick={spinRoulette} disabled={isSpinning || (isMultiplayer && !isHost)} className={`w-full py-6 rounded-[2rem] font-black text-2xl shadow-2xl transition-all active:scale-95 border-b-[10px] flex items-center justify-center gap-4 ${isSpinning || (isMultiplayer && !isHost) ? 'bg-slate-800 border-slate-950 text-slate-600' : isReviveTurn ? 'bg-purple-600 border-purple-900 text-white' : isHealTurn ? 'bg-emerald-600 border-emerald-900 text-white' : 'bg-red-600 border-red-900 text-white hover:brightness-110'} ${(isMultiplayer && !isHost) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                {isSpinning ? <RotateCcw className="animate-spin" /> : isMultiplayer && !isHost ? 'WAITING FOR HOST' : 'SPIN'}
              </button>
            )}
          </div>
        </div>

        <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 flex flex-col overflow-hidden h-[200px] shrink-0">
          <div className="text-slate-500 font-black text-[11px] tracking-[0.3em] uppercase flex items-center gap-2 mb-4"><History size={16} /> ACTIVITY LOGS</div>
          <div className="overflow-y-auto flex-1 space-y-2 pr-1 custom-scrollbar">
            {logs.map((log) => (
              <div key={log.id} className={`flex items-center gap-4 p-4 rounded-2xl border ${log.type === 'damage' ? 'bg-red-500/5 border-red-500/10' : log.type === 'heal' ? 'bg-emerald-500/5 border-emerald-500/10' : log.type === 'revive' ? 'bg-purple-500/5 border-purple-500/10' : 'bg-slate-950 border-slate-800/60'}`}>
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shrink-0 font-black text-[10px] text-slate-500">T{log.turn}</div>
                <span className={`text-sm font-bold truncate flex-1 ${log.type === 'death' ? 'text-red-400' : 'text-slate-200'}`}>{log.message}</span>
                {log.amount && log.type !== 'revive' && <span className={`text-base font-black shrink-0 px-3 py-1 rounded-xl tabular-nums ${log.type === 'damage' ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>{log.type === 'damage' ? '-' : '+'}{log.amount}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="md:w-[360px] flex flex-col gap-6 md:overflow-hidden md:h-full shrink-0">
        <div className="bg-slate-900 rounded-[2.5rem] p-6 border border-slate-800 flex flex-col h-1/2 min-h-[300px]">
          <div className="text-slate-500 font-black text-[11px] mb-5 uppercase flex items-center justify-between px-2 tracking-[0.2em]"><span className="flex items-center gap-2 text-white"><Users size={16} /> 生存者</span><span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-[11px] tabular-nums">{survivorsSorted.length}</span></div>
          <div className="space-y-3 overflow-y-auto flex-1 pr-1 custom-scrollbar">
            {survivorsSorted.map(p => {
              const isLowHp = p.hp <= initialHP * 0.3;
              const isSelected = selectedPlayerIds.includes(p.id);
              const targetedProb = isHpBalanceEnabled ? Math.round((p.hp / (totalSurvivorHp || 1)) * 100) : Math.round(100 / (survivorsSorted.length || 1));
              const isAnimating = animatingPlayerIds.includes(p.id) || (animatingPlayerIds.includes("SPECIAL") && lastResult?.player !== p.name);

              return (
                <div
                  key={p.id} onClick={() => isManualSelectionPhase && togglePlayerSelection(p.id)}
                  className={`bg-slate-950 p-4 rounded-2xl border flex flex-col gap-2 group relative overflow-hidden transition-all duration-300 ${isManualSelectionPhase ? 'cursor-pointer hover:border-indigo-500' : ''} ${isSelected ? 'border-indigo-500 ring-4 ring-indigo-500/20 bg-indigo-500/5' : isAnimating ? (animatingType === 'damage' ? 'border-red-500 ring-4 ring-red-500/20 bg-red-500/5' : 'border-emerald-500 ring-4 ring-emerald-500/20 bg-emerald-500/5') : (isLowHp ? 'border-red-900 animate-pulse bg-red-950/10' : 'border-slate-800 hover:border-slate-700')}`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 truncate pr-2">
                      {isManualSelectionPhase && (<div className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-700'}`}>{isSelected && <Check size={10} className="text-white" />}</div>)}
                      {isLowHp && <ShieldAlert size={14} className="text-red-500 shrink-0" />}
                      <span className={`font-bold text-sm truncate italic ${p.teamColor || 'text-slate-200'}`}>{p.team ? `[${p.team}] ` : ''}{p.name}</span>
                    </div>
                    <span className={`text-lg font-black tabular-nums ${isLowHp ? 'text-red-500' : 'text-emerald-400'}`}>{p.hp}</span>
                  </div>
                  {isHpBalanceEnabled && (
                    <div className="flex items-center gap-2"><div className="flex-1 h-1 bg-slate-900 rounded-full overflow-hidden"><div className={`h-full transition-all duration-500 ${targetedProb > 25 ? 'bg-amber-500' : 'bg-slate-700'}`} style={{ width: `${targetedProb}%` }} /></div><span className="text-[9px] font-black text-slate-500 tabular-nums">狙われやすさ: {targetedProb}%</span></div>
                  )}
                  {isAnimating && (
                    <div className={`absolute inset-0 flex items-center justify-center font-black text-2xl animate-out fade-out slide-out-to-top-8 duration-1000 ${animatingType === 'damage' ? 'text-red-500' : 'text-emerald-400'}`}>
                      {animatingType === 'damage' ? `-${lastResult?.amount}` : `+${lastResult?.amount}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-slate-900 rounded-[2.5rem] p-6 border border-slate-800 flex flex-col h-1/2 min-h-[300px] overflow-hidden">
          <div className="text-slate-500 font-black text-[11px] uppercase flex items-center gap-2 mb-4 tracking-[0.2em] px-2"><Trophy size={16} className="text-amber-500" /> ランキング</div>
          <RankingList ranking={getCombinedRanking()} />
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; border: 2px solid transparent; background-clip: padding-box; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        [draggable="true"] { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
      `}} />
    </div>
  );
};

export default App;

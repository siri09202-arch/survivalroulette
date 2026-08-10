import React, { useState, useEffect, useRef, Component } from 'react';

// ===== ErrorBoundary: JSエラー時に黒画面ではなくエラー画面を表示 =====
interface EBState { hasError: boolean; error?: Error; }
class ErrorBoundary extends Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: 'sans-serif' }}>
          <div style={{ background: '#1e293b', border: '1px solid #ef4444', borderRadius: '1.5rem', padding: '2.5rem', maxWidth: '480px', width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <h2 style={{ color: '#f87171', fontWeight: 900, fontSize: '1.25rem', marginBottom: '0.5rem' }}>エラーが発生しました</h2>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              {this.state.error?.message || '予期しないエラーが発生しました。'}
            </p>
            <button
              onClick={() => { this.setState({ hasError: false, error: undefined }); }}
              style={{ background: '#4f46e5', color: 'white', border: 'none', borderRadius: '0.75rem', padding: '0.75rem 2rem', fontWeight: 900, fontSize: '1rem', cursor: 'pointer' }}
            >
              ホームに戻る
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import {
  Users, Heart, Skull, History, Swords, Trophy, RotateCcw, Play,
  Sparkles, Zap, Copy, Check, Clock, Settings2, Plus, Trash2,
  Percent, Activity, ShieldAlert,
  UserPlus, Hand, ToggleLeft, ToggleRight, Type,
  Edit3, GripVertical, Scale
} from 'lucide-react';

// ===== ルームAPI ヘルパー =====
// GitHub Pages上ではAPIが動かないため、window.__API_BASE__があればそれを使う
declare global { interface Window { __API_BASE__?: string; } }
// 毎回window.__API_BASE__を参照することで、スクリプトロード後にセットされた値も確実に使用
const getApiBase = () => (typeof window !== 'undefined' && window.__API_BASE__) ? window.__API_BASE__ : '';

const API = {
  getRoom: async (roomId: string) => {
    const res = await fetch(`${getApiBase()}/api/rooms/${roomId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  createRoom: async (data: any) => {
    const res = await fetch(`${getApiBase()}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  patchRoom: async (roomId: string, patch: any) => {
    const res = await fetch(`${getApiBase()}/api/rooms/${roomId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
};

// ===== UID管理（localStorage永続） =====
const getOrCreateUid = (): string => {
  let uid = localStorage.getItem('player_uid');
  if (!uid) { uid = 'uid-' + Math.random().toString(36).substring(2, 12); localStorage.setItem('player_uid', uid); }
  return uid;
};

interface Player {
  id: string; uid?: string; name: string; hp: number;
  status: 'alive' | 'dead'; team?: string | null;
  teamColor?: string | null; teamIndex?: number;
  barriers?: number; // 無敵バリアカード枚数
}
interface EliminatedPlayer { name: string; turn: number; }
interface LogEntry { id: number; turn: number; type: string; message: string; amount?: string | number; target?: string; }
interface DisplayResult { player: string; amount: string | number; }
interface LastResult { player: string; targetIds: string[]; amount: string | number; type: string; isReverse?: boolean; isMulti?: boolean; }
// マルチイベント（爆弾・クイズ）は廃止済み
interface FixedItem { id: number; value: number; prob: number; }
interface Config { rangeMin: number; rangeMax: number; rangeProb: number; fixedItems: FixedItem[]; }
interface ReviveEvent { id: number; turn: number; type: 'steal' | 'copy'; }
interface ManualPlayer { name: string; teamIndex: number; }

// ===== 数値変換関数（全100種以上対応） =====
const convertNumber = (num: number | string, format: string): string | number => {
  if (typeof num !== 'number' || format === 'default') return num;
  const n = Math.floor(num);

  const digitMap = (digits: string[]) => n.toString().split('').map(d => digits[parseInt(d)] ?? d).join('');

  switch (format) {
    case 'roman': {
      if (n === 0) return 'N';
      if (n < 0) return '-' + (convertNumber(-n, 'roman') as string);
      const vals: [string, number][] = [['M',1000],['CM',900],['D',500],['CD',400],['C',100],['XC',90],['L',50],['XL',40],['X',10],['IX',9],['V',5],['IV',4],['I',1]];
      let res = '', x = n;
      for (const [s, v] of vals) { while (x >= v) { res += s; x -= v; } }
      return res;
    }
    case 'kanji':    return digitMap(['零','一','二','三','四','五','六','七','八','九']);
    case 'daiji':    return digitMap(['零','壱','弐','参','肆','伍','陸','漆','捌','玖']);
    case 'indic':    return digitMap(['०','१','२','३','४','५','६','७','८','९']); // インド数字
    case 'thai':     return digitMap(['๐','๑','๒','๓','๔','๕','๖','๗','๘','๙']);
    case 'arabic_eastern': return digitMap(['٠','١','٢','٣','٤','٥','٦','٧','٨','٩']); // 東アラビア
    case 'persian':  return digitMap(['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹']); // ペルシア
    case 'nko':      return digitMap(['߀','߁','߂','߃','߄','߅','߆','߇','߈','߉']); // ンコ
    case 'fullwidth':return digitMap(['０','１','２','３','４','５','６','７','８','９']);
    case 'devanagari':return digitMap(['०','१','२','३','४','५','६','७','८','९']);
    case 'bengali':  return digitMap(['০','১','২','৩','৪','৫','৬','৭','৮','৯']);
    case 'gujarati': return digitMap(['૦','૧','૨','૩','૪','૫','૬','૭','૮','૯']);
    case 'gurmukhi': return digitMap(['੦','੧','੨','੩','੪','੫','੬','੭','੮','੯']);
    case 'kannada':  return digitMap(['೦','೧','೨','೩','೪','೫','೬','೭','೮','೯']);
    case 'telugu':   return digitMap(['౦','౧','౨','౩','౪','౫','౬','౭','౮','౯']);
    case 'malayalam':return digitMap(['൦','൧','൨','൩','൪','൫','൬','൭','൮','൯']);
    case 'tibetan':  return digitMap(['༠','༡','༢','༣','༤','༥','༦','༧','༨','༩']);
    case 'myanmar':  return digitMap(['၀','၁','၂','၃','၄','၅','၆','၇','၈','၉']);
    case 'myanmar_shan': return digitMap(['႐','႑','႒','႓','႔','႕','႖','႗','႘','႙']); // ミャンマー・シャン
    case 'myanmar_tai_laing': return digitMap(['꧰','꧱','꧲','꧳','꧴','꧵','꧶','꧷','꧸','꧹']); // ミャンマー・タイレー
    case 'khmer':    return digitMap(['០','១','២','៣','៤','៥','៦','៧','៨','៩']);
    case 'lao':      return digitMap(['໐','໑','໒','໓','໔','໕','໖','໗','໘','໙']);
    case 'mongolian':return digitMap(['᠐','᠑','᠒','᠓','᠔','᠕','᠖','᠗','᠘','᠙']);
    case 'oriya':    return digitMap(['୦','୧','୨','୩','୪','୫','୬','୭','୮','୯']);
    case 'tamil':    return digitMap(['௦','௧','௨','௩','௪','௫','௬','௭','௮','௯']);
    case 'sinhala':  return digitMap(['0','𑇡','𑇢','𑇣','𑇤','𑇥','𑇦','𑇧','𑇨','𑇩']); // シンハラ古形数字 (U+111E1-)
    case 'tai_tham': return digitMap(['᪀','᪁','᪂','᪃','᪄','᪅','᪆','᪇','᪈','᪉']); // タイ・タムホラ数字
    case 'tai_tham2':return digitMap(['᪐','᪑','᪒','᪓','᪔','᪕','᪖','᪗','᪘','᪙']); // タイ・タムタム数字
    case 'sundanese':return digitMap(['᮰','᮱','᮲','᮳','᮴','᮵','᮶','᮷','᮸','᮹']);
    case 'balinese': return digitMap(['᭐','᭑','᭒','᭓','᭔','᭕','᭖','᭗','᭘','᭙']);
    case 'javanese': return digitMap(['꧐','꧑','꧒','꧓','꧔','꧕','꧖','꧗','꧘','꧙']);
    case 'cham':     return digitMap(['꩐','꩑','꩒','꩓','꩔','꩕','꩖','꩗','꩘','꩙']);
    case 'limbu':    return digitMap(['᥆','᥇','᥈','᥉','᥊','᥋','᥌','᥍','᥎','᥏']); // リンブ
    case 'new_tai_lue': return digitMap(['᧐','᧑','᧒','᧓','᧔','᧕','᧖','᧗','᧘','᧙']); // ニュータイルー
    case 'lepcha':   return digitMap(['᱀','᱁','᱂','᱃','᱄','᱅','᱆','᱇','᱈','᱉']); // レプチャ
    case 'ol_chiki': return digitMap(['᱐','᱑','᱒','᱓','᱔','᱕','᱖','᱗','᱘','᱙']); // オルチキ
    case 'vai':      return digitMap(['꘠','꘡','꘢','꘣','꘤','꘥','꘦','꘧','꘨','꘩']); // ヴァイ
    case 'saurashtra':return digitMap(['꣐','꣑','꣒','꣓','꣔','꣕','꣖','꣗','꣘','꣙']); // サウルシュトラ
    case 'kayah_li': return digitMap(['꤀','꤁','꤂','꤃','꤄','꤅','꤆','꤇','꤈','꤉']); // カヤー
    case 'meetei':   return digitMap(['꯰','꯱','꯲','꯳','꯴','꯵','꯶','꯷','꯸','꯹']); // メイテイ
    case 'brahmi':   return digitMap(['𑁦','𑁧','𑁨','𑁩','𑁪','𑁫','𑁬','𑁭','𑁮','𑁯']); // ブラーフミー
    case 'sora_sompeng': return digitMap(['𑃰','𑃱','𑃲','𑃳','𑃴','𑃵','𑃶','𑃷','𑃸','𑃹']); // ソラ・ソンペン
    case 'chakma':   return digitMap(['𑄶','𑄷','𑄸','𑄹','𑄺','𑄻','𑄼','𑄽','𑄾','𑄿']); // チャクマ
    case 'sharada':  return digitMap(['𑇐','𑇑','𑇒','𑇓','𑇔','𑇕','𑇖','𑇗','𑇘','𑇙']); // シャーラダー
    case 'takri':    return digitMap(['𑛀','𑛁','𑛂','𑛃','𑛄','𑛅','𑛆','𑛇','𑛈','𑛉']); // タクリ
    case 'modi':     return digitMap(['𑙐','𑙑','𑙒','𑙓','𑙔','𑙕','𑙖','𑙗','𑙘','𑙙']); // モディ
    case 'tirhuta':  return digitMap(['𑓐','𑓑','𑓒','𑓓','𑓔','𑓕','𑓖','𑓗','𑓘','𑓙']); // ティルフタ
    case 'warang_citi': return digitMap(['𑣠','𑣡','𑣢','𑣣','𑣤','𑣥','𑣦','𑣧','𑣨','𑣩']); // ワランチティ
    case 'adlam':    return digitMap(['𑱐','𑱑','𑱒','𑱓','𑱔','𑱕','𑱖','𑱗','𑱘','𑱙']); // アドラム
    case 'pahawh_hmong': return digitMap(['𖭐','𖭑','𖭒','𖭓','𖭔','𖭕','𖭖','𖭗','𖭘','𖭙']); // パハウ・フモン
    case 'dogra':    return digitMap(['𑣠','𑣡','𑣢','𑣣','𑣤','𑣥','𑣦','𑣧','𑣨','𑣩']); // ドグラ (U+118E0-)
    case 'dives_akuru': return digitMap(['𑥐','𑥑','𑥒','𑥓','𑥔','𑥕','𑥖','𑥗','𑥘','𑥙']); // ディベス・アクル
    case 'masaram_gondi': return digitMap(['𑵐','𑵑','𑵒','𑵓','𑵔','𑵕','𑵖','𑵗','𑵘','𑵙']); // マサラム・ゴンディ
    case 'gunjala_gondi': return digitMap(['𑶠','𑶡','𑶢','𑶣','𑶤','𑶥','𑶦','𑶧','𑶨','𑶩']); // グンジャラ・ゴンディ
    case 'kaithi':   return digitMap(['𑂠','𑂡','𑂢','𑂣','𑂤','𑂥','𑂦','𑂧','𑂨','𑂩']); // カイティ
    case 'mahajani': return digitMap(['𑅐','𑅑','𑅒','𑅓','𑅔','𑅕','𑅖','𑅗','𑅘','𑅙']); // マハージャニー
    case 'osmanya':  return digitMap(['𐒠','𐒡','𐒢','𐒣','𐒤','𐒥','𐒦','𐒧','𐒨','𐒩']); // オスマニア
    case 'superscript': return digitMap(['⁰','¹','²','³','⁴','⁵','⁶','⁷','⁸','⁹']); // 上付き
    case 'subscript':   return digitMap(['₀','₁','₂','₃','₄','₅','₆','₇','₈','₉']); // 下付き
    case 'bold_digit':  return digitMap(['𝟎','𝟏','𝟐','𝟑','𝟒','𝟓','𝟔','𝟕','𝟖','𝟗']); // 太字
    case 'double_struck': return digitMap(['𝟘','𝟙','𝟚','𝟛','𝟜','𝟝','𝟞','𝟟','𝟠','𝟡']); // 黒板太字
    case 'sans_serif':  return digitMap(['𝟢','𝟣','𝟤','𝟥','𝟦','𝟧','𝟨','𝟩','𝟪','𝟫']); // サンセリフ
    case 'sans_bold':   return digitMap(['𝟬','𝟭','𝟮','𝟯','𝟰','𝟱','𝟲','𝟳','𝟴','𝟵']); // サンセリフ太字
    case 'monospace':   return digitMap(['𝟶','𝟷','𝟸','𝟹','𝟺','𝟻','𝟼','𝟽','𝟾','𝟿']); // 等幅
    case 'suzhou': {
      // 蘇州数字（商業用）
      const suMap: Record<string, string> = { '0':'〇','1':'〡','2':'〢','3':'〣','4':'〤','5':'〥','6':'〦','7':'〧','8':'〨','9':'〩' };
      return n.toString().split('').map(d => suMap[d] ?? d).join('');
    }
    case 'black_circled': {
      // 黒丸数字 ⓿❶❷…❾（0-9）
      const bc = ['⓿','❶','❷','❸','❹','❺','❻','❼','❽','❾'];
      if (n >= 0 && n <= 9) return bc[n];
      return n.toString().split('').map(d => bc[parseInt(d)] ?? d).join('');
    }
    case 'circled': {
      const c = ['⓪','①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳',
                 '㉑','㉒','㉓','㉔','㉕','㉖','㉗','㉘','㉙','㉚','㉛','㉜','㉝','㉞','㉟','㊱','㊲','㊳','㊴','㊵',
                 '㊶','㊷','㊸','㊹','㊺','㊻','㊼','㊽','㊾','㊿'];
      if (n >= 0 && n <= 50) return c[n];
      return n.toString().split('').map(d => c[parseInt(d)] ?? d).join('');
    }
    case 'parenthesized': {
      // 括弧付き数字 ①②…⑳（丸囲みと別枠として1-20）
      const p = ['⑴','⑵','⑶','⑷','⑸','⑹','⑺','⑻','⑼','⑽','⑾','⑿','⒀','⒁','⒂','⒃','⒄','⒅','⒆','⒇'];
      if (n >= 1 && n <= 20) return p[n - 1];
      return n.toString().split('').map(d => (parseInt(d) >= 1 ? p[parseInt(d) - 1] : '⑽') ?? d).join('');
    }
    case 'dotted': {
      // ドット付き数字 ⒈⒉…⒛
      const dot = ['⒈','⒉','⒊','⒋','⒌','⒍','⒎','⒏','⒐','⒑','⒒','⒓','⒔','⒕','⒖','⒗','⒘','⒙','⒚','⒛'];
      if (n >= 1 && n <= 20) return dot[n - 1];
      return n.toString().split('').map(d => (parseInt(d) >= 1 ? dot[parseInt(d) - 1] : dot[0]) ?? d).join('');
    }
    case 'counting_rod': {
      // カウントロッド数字（算木）
      const cr = ['𝍠','𝍡','𝍢','𝍣','𝍤','𝍥','𝍦','𝍧','𝍨','𝍩'];
      return n.toString().split('').map(d => cr[parseInt(d)] ?? d).join('');
    }
    case 'tangut': {
      // 西夏文字（Tangut）数字 — Noto Serif Tangutフォントが必要
      // U+17000台の正規Tangutコードポイント使用
      const tD = [
        '0',                              // 0 (西夏文字に0相当なし → アラビア数字)
        String.fromCodePoint(0x18229),    // 1
        String.fromCodePoint(0x1736B),    // 2
        String.fromCodePoint(0x18555),    // 3
        String.fromCodePoint(0x17943),    // 4
        String.fromCodePoint(0x173C1),    // 5
        String.fromCodePoint(0x17901),    // 6
        String.fromCodePoint(0x174B9),    // 7
        String.fromCodePoint(0x1824B),    // 8
        String.fromCodePoint(0x178AD),    // 9
      ];
      return digitMap(tD);
    }
    case 'sinhala_archaic': {
      // シンハラ古形数字 (U+111E1-111E9) — Noto Sans Sinhalaフォントが必要
      // 0は古形なし → 現代数字で代用
      const sinhalaD = ['0', ...Array.from({length: 9}, (_, i) => String.fromCodePoint(0x111E1 + i))];
      return digitMap(sinhalaD);
    }
    case 'kharoshthi': {
      // カローシュティー数字 (加算式) — Noto Sans Kharoshthiフォントが必要
      // 1=𐩀 2=𐩁 3=𐩂 4=𐩃 5=4+1 6=4+2 7=4+3 8=4+4 9=4+4+1
      const k1 = String.fromCodePoint(0x10A40);
      const k2 = String.fromCodePoint(0x10A41);
      const k3 = String.fromCodePoint(0x10A42);
      const k4 = String.fromCodePoint(0x10A43);
      const kharMap = ['0', k1, k2, k3, k4, k4+k1, k4+k2, k4+k3, k4+k4, k4+k4+k1];
      // 桁ごとに上記マップを適用（各桁の数値表現を結合）
      if (n === 0) return kharMap[0];
      return n.toString().split('').map(d => kharMap[parseInt(d)] ?? d).join('');
    }
    case 'mandaic': {
      // マンダ文字数字 (U+0840-0848 → 1-9) — Noto Sans Mandaicフォントが必要
      // 0は古形なし → 現代数字で代用
      const mandaicD = ['0', ...Array.from({length: 9}, (_, i) => String.fromCodePoint(0x0840 + i))];
      return digitMap(mandaicD);
    }
    case 'old_south_arabian': {
      // 古代南アラビア数字 (加算式) — Noto Sans Old South Arabianフォントが必要
      // 1=𐩽 5=𐩾 0は現代数字で代用
      const osa1c = String.fromCodePoint(0x10A7D);
      const osa5c = String.fromCodePoint(0x10A7E);
      const osaMap = ['0', osa1c, osa1c.repeat(2), osa1c.repeat(3), osa1c.repeat(4),
        osa5c, osa5c+osa1c, osa5c+osa1c.repeat(2), osa5c+osa1c.repeat(3), osa5c+osa1c.repeat(4)];
      if (n === 0) return osaMap[0];
      return n.toString().split('').map(d => osaMap[parseInt(d)] ?? d).join('');
    }
    case 'bassa_vah': {
      // バサ・ヴァ数字 — Noto Sans Bassa Vahフォントが必要
      // バサ・ヴァ文字は標準アラビア数字をそのフォントで表示
      return n.toString();
    }
    case 'greek': {
      // ギリシャ数字（ミレトス式）
      const greekUnits  = ['','α','β','γ','δ','ε','ϛ','ζ','η','θ'];
      const greekTens   = ['','ι','κ','λ','μ','ν','ξ','ο','π','ϟ'];
      const greekHunds  = ['','ρ','σ','τ','υ','φ','χ','ψ','ω','ϡ'];
      if (n === 0) return '0';
      if (n < 0) return '-' + (convertNumber(-n, 'greek') as string);
      let res = '';
      const h = Math.floor(n / 100) % 10;
      const t = Math.floor(n / 10) % 10;
      const u = n % 10;
      if (Math.floor(n / 1000) > 0) res += '͵' + greekUnits[Math.floor(n / 1000) % 10];
      res += greekHunds[h] + greekTens[t] + greekUnits[u];
      return res || n.toString();
    }
    case 'hebrew': {
      // ヘブライ数字
      const hUnits = ['','א','ב','ג','ד','ה','ו','ז','ח','ט'];
      const hTens  = ['','י','כ','ל','מ','נ','ס','ע','פ','צ'];
      const hHunds = ['','ק','ר','ש','ת','תק','תר','תש','תת','תתק'];
      if (n <= 0) return '0';
      let x = n % 1000; let res = '';
      res += hHunds[Math.floor(x / 100)];
      x = x % 100;
      if (x === 15) res += 'טו';
      else if (x === 16) res += 'טז';
      else { res += hTens[Math.floor(x / 10)]; res += hUnits[x % 10]; }
      return res || n.toString();
    }
    case 'armenian': {
      const armenianLetters = ['Ա','Բ','Գ','Դ','Ե','Զ','Է','Ը','Թ','Ժ','Ի','Լ','Խ','Ծ','Կ','Հ','Ձ','Ղ','Ճ','Մ','Յ','Ն','Շ','Ո','Չ','Պ','Ջ','Ռ','Ս','Վ','Տ','Ր','Ց','Ւ','Փ','Ք'];
      const armVals=[9000,8000,7000,6000,5000,4000,3000,2000,1000,900,800,700,600,500,400,300,200,100,90,80,70,60,50,40,30,20,10,9,8,7,6,5,4,3,2,1];
      if (n <= 0) return '0';
      let res = '', x = n;
      for (let i = 0; i < armVals.length; i++) {
        while (x >= armVals[i]) { res += armenianLetters[i]; x -= armVals[i]; }
      }
      return res || n.toString();
    }
    case 'georgian': {
      const gv2 = [10000,9000,8000,7000,6000,5000,4000,3000,2000,1000,900,800,700,600,500,400,300,200,100,90,80,70,60,50,40,30,20,10,9,8,7,6,5,4,3,2,1];
      const gc2 = ['ჵჵ','ჵჰ','ჵჯ','ჵჴ','ჵხ','ჵჭ','ჵწ','ჵძ','ჵც','ჵ','ჰ','ჯ','ჴ','ხ','ჭ','წ','ძ','ც','ქ','ჩ','შ','ყ','ღ','ფ','ო','ნ','მ','ლ','კ','ი','თ','ზ','ვ','ე','დ','გ','ბ','ა'];
      if (n <= 0) return '0';
      let res = '', x = n;
      for (let i = 0; i < gv2.length; i++) {
        while (x >= gv2[i]) { res += gc2[i]; x -= gv2[i]; }
      }
      return res || n.toString();
    }
    case 'ethiopic': {
      // ゲエズ数字
      const ethOnes = ['','፩','፪','፫','፬','፭','፮','፯','፰','፱'];
      const ethTens  = ['','፲','፳','፴','፵','፶','፷','፸','፹','፺'];
      if (n <= 0) return '0';
      if (n === 100) return '፻';
      if (n === 10000) return '፼';
      let res = '', x = n;
      const ten_thou = Math.floor(x / 10000); x %= 10000;
      const hundreds = Math.floor(x / 100); x %= 100;
      if (ten_thou > 0) res += ethOnes[ten_thou] + '፼';
      if (hundreds > 0) res += ethOnes[hundreds] + '፻';
      res += ethTens[Math.floor(x / 10)] + ethOnes[x % 10];
      return res || n.toString();
    }
    case 'babylonian': {
      // バビロニア楔形数字（簡略版）
      const ones = ['','𒁹','𒈫','𒐈','𒐉','𒐊','𒐋','𒑂','𒑄','𒑆'];
      const tens  = ['','𒌋','𒎙','𒌍','𒐏','𒐐'];
      if (n <= 0) return '𒑳';
      let res = '', x = n;
      const s60s = Math.floor(x / 60); x %= 60;
      if (s60s > 0) res += (s60s <= 9 ? ones[s60s] : tens[Math.floor(s60s/10)] + ones[s60s%10]) + ' ';
      res += tens[Math.floor(x / 10)] + ones[x % 10];
      return res.trim() || '𒑳';
    }
    case 'mayan': {
      // マヤ数字（ドット・バー式）
      const bar = '━', dot = '•', zero = '𝋠';
      if (n === 0) return zero;
      const toMayan = (v: number): string => {
        if (v === 0) return zero;
        const bars = Math.floor(v / 5);
        const dots = v % 5;
        return (bar.repeat(bars) + dot.repeat(dots)) || zero;
      };
      if (n < 20) return toMayan(n);
      const high = Math.floor(n / 20);
      const low  = n % 20;
      return toMayan(high) + '|' + toMayan(low);
    }
    case 'egyptian': {
      // エジプト象形数字
      const egyMap: [number, string][] = [
        [1000000,'𓁨'],[100000,'𓆐'],[10000,'𓂭'],[1000,'𓆼'],[100,'𓍢'],[10,'𓎆'],[1,'𓏺']
      ];
      if (n <= 0) return '𓏺';
      let res = '', x = n;
      for (const [v, s] of egyMap) {
        const count = Math.floor(x / v); x %= v;
        res += s.repeat(count);
      }
      return res || '𓏺';
    }
    default: return num;
  }
};

// ===== 日本の一般国道データ =====
interface JapanRoad { no: number; from: string; to: string; }
const JAPAN_ROADS: JapanRoad[] = [
  { no:1,   from:'東京都中央区',         to:'大阪府大阪市北区' },
  { no:2,   from:'大阪府大阪市北区',     to:'福岡県北九州市門司区' },
  { no:3,   from:'福岡県北九州市門司区', to:'鹿児島県鹿児島市' },
  { no:4,   from:'東京都中央区',         to:'青森県青森市' },
  { no:5,   from:'北海道函館市',         to:'北海道札幌市中央区' },
  { no:6,   from:'東京都中央区',         to:'宮城県仙台市宮城野区' },
  { no:7,   from:'新潟県新潟市中央区',   to:'青森県青森市' },
  { no:8,   from:'新潟県新潟市中央区',   to:'京都府京都市下京区' },
  { no:9,   from:'京都府京都市下京区',   to:'山口県下関市' },
  { no:10,  from:'福岡県北九州市門司区', to:'鹿児島県鹿児島市' },
  { no:11,  from:'徳島県徳島市',         to:'愛媛県松山市' },
  { no:12,  from:'北海道札幌市中央区',   to:'北海道旭川市' },
  { no:13,  from:'福島県福島市',         to:'秋田県秋田市' },
  { no:14,  from:'東京都中央区',         to:'千葉県千葉市中央区' },
  { no:15,  from:'東京都中央区',         to:'神奈川県横浜市神奈川区' },
  { no:16,  from:'神奈川県横浜市西区',   to:'神奈川県横浜市西区' },
  { no:17,  from:'東京都中央区',         to:'新潟県新潟市中央区' },
  { no:18,  from:'群馬県高崎市',         to:'新潟県上越市' },
  { no:19,  from:'愛知県名古屋市熱田区', to:'長野県長野市' },
  { no:20,  from:'東京都中央区',         to:'長野県塩尻市' },
  { no:21,  from:'岐阜県瑞浪市',         to:'滋賀県米原市' },
  { no:22,  from:'愛知県名古屋市熱田区', to:'岐阜県岐阜市' },
  { no:23,  from:'愛知県豊橋市',         to:'三重県伊勢市' },
  { no:24,  from:'京都府京都市下京区',   to:'和歌山県和歌山市' },
  { no:25,  from:'三重県四日市市',       to:'大阪府大阪市北区' },
  { no:26,  from:'大阪府大阪市北区',     to:'和歌山県和歌山市' },
  { no:27,  from:'福井県敦賀市',         to:'京都府船井郡京丹波町' },
  { no:28,  from:'兵庫県神戸市中央区',   to:'徳島県徳島市' },
  { no:29,  from:'兵庫県姫路市',         to:'鳥取県鳥取市' },
  { no:30,  from:'岡山県岡山市北区',     to:'香川県高松市' },
  { no:31,  from:'広島県安芸郡海田町',   to:'広島県呉市' },
  { no:32,  from:'香川県高松市',         to:'高知県高知市' },
  { no:33,  from:'高知県高知市',         to:'愛媛県松山市' },
  { no:34,  from:'佐賀県鳥栖市',         to:'長崎県長崎市' },
  { no:35,  from:'佐賀県武雄市',         to:'長崎県佐世保市' },
  { no:36,  from:'北海道札幌市中央区',   to:'北海道室蘭市' },
  { no:37,  from:'北海道山越郡長万部町', to:'北海道室蘭市' },
  { no:38,  from:'北海道滝川市',         to:'北海道釧路市' },
  { no:39,  from:'北海道旭川市',         to:'北海道網走市' },
  { no:40,  from:'北海道旭川市',         to:'北海道稚内市' },
  { no:41,  from:'愛知県名古屋市東区',   to:'富山県富山市' },
  { no:42,  from:'静岡県浜松市中央区',   to:'和歌山県和歌山市' },
  { no:43,  from:'大阪府大阪市西成区',   to:'兵庫県神戸市灘区' },
  { no:44,  from:'北海道釧路市',         to:'北海道根室市' },
  { no:45,  from:'宮城県仙台市青葉区',   to:'青森県青森市' },
  { no:46,  from:'岩手県盛岡市',         to:'秋田県秋田市' },
  { no:47,  from:'宮城県仙台市宮城野区', to:'山形県酒田市' },
  { no:48,  from:'宮城県仙台市青葉区',   to:'山形県山形市' },
  { no:49,  from:'福島県いわき市',       to:'新潟県新潟市中央区' },
  { no:50,  from:'群馬県前橋市',         to:'茨城県水戸市' },
  { no:51,  from:'千葉県千葉市中央区',   to:'茨城県水戸市' },
  { no:52,  from:'静岡県静岡市清水区',   to:'山梨県甲府市' },
  { no:53,  from:'岡山県岡山市北区',     to:'鳥取県鳥取市' },
  { no:54,  from:'広島県広島市中区',     to:'島根県松江市' },
  { no:55,  from:'徳島県徳島市',         to:'高知県高知市' },
  { no:56,  from:'高知県高知市',         to:'愛媛県松山市' },
  { no:57,  from:'大分県大分市',         to:'長崎県長崎市' },
  { no:58,  from:'鹿児島県鹿児島市',     to:'沖縄県那覇市' },
  { no:101, from:'青森県青森市',         to:'秋田県秋田市' },
  { no:102, from:'青森県弘前市',         to:'青森県十和田市' },
  { no:103, from:'青森県青森市',         to:'秋田県大館市' },
  { no:104, from:'青森県八戸市',         to:'秋田県大館市' },
  { no:105, from:'秋田県由利本荘市',     to:'秋田県北秋田市' },
  { no:106, from:'岩手県宮古市',         to:'岩手県盛岡市' },
  { no:107, from:'岩手県大船渡市',       to:'秋田県由利本荘市' },
  { no:108, from:'宮城県石巻市',         to:'秋田県由利本荘市' },
  { no:112, from:'山形県山形市',         to:'山形県酒田市' },
  { no:113, from:'新潟県新潟市中央区',   to:'福島県相馬市' },
  { no:114, from:'福島県福島市',         to:'福島県双葉郡浪江町' },
  { no:115, from:'福島県相馬市',         to:'福島県耶麻郡猪苗代町' },
  { no:116, from:'新潟県柏崎市',         to:'新潟県新潟市中央区' },
  { no:117, from:'長野県長野市',         to:'新潟県小千谷市' },
  { no:118, from:'茨城県水戸市',         to:'福島県会津若松市' },
  { no:119, from:'栃木県日光市',         to:'栃木県宇都宮市' },
  { no:120, from:'栃木県日光市',         to:'群馬県沼田市' },
  { no:121, from:'山形県米沢市',         to:'栃木県芳賀郡益子町' },
  { no:122, from:'栃木県日光市',         to:'東京都豊島区' },
  { no:123, from:'栃木県宇都宮市',       to:'茨城県水戸市' },
  { no:124, from:'千葉県銚子市',         to:'茨城県水戸市' },
  { no:125, from:'千葉県香取市',         to:'埼玉県熊谷市' },
  { no:126, from:'千葉県銚子市',         to:'千葉県千葉市中央区' },
  { no:127, from:'千葉県館山市',         to:'千葉県木更津市' },
  { no:128, from:'千葉県館山市',         to:'千葉県千葉市中央区' },
  { no:129, from:'神奈川県平塚市',       to:'神奈川県相模原市' },
  { no:130, from:'東京都港区・東京港',   to:'東京都港区芝一丁目' },
  { no:131, from:'東京都大田区・羽田空港',to:'東京都大田区大森東二丁目' },
  { no:132, from:'神奈川県川崎市川崎区・川崎港',to:'神奈川県川崎市川崎区宮前町' },
  { no:133, from:'神奈川県横浜市中区・横浜港',to:'神奈川県横浜市中区桜木町' },
  { no:134, from:'神奈川県横須賀市',     to:'神奈川県中郡大磯町' },
  { no:135, from:'静岡県下田市',         to:'神奈川県小田原市' },
  { no:136, from:'静岡県下田市',         to:'静岡県三島市' },
  { no:137, from:'山梨県富士吉田市',     to:'山梨県笛吹市' },
  { no:138, from:'山梨県富士吉田市',     to:'神奈川県小田原市' },
  { no:139, from:'静岡県富士市',         to:'東京都西多摩郡奥多摩町' },
  { no:140, from:'埼玉県熊谷市',         to:'山梨県南巨摩郡富士川町' },
  { no:141, from:'山梨県韮崎市',         to:'長野県上田市' },
  { no:142, from:'長野県北佐久郡軽井沢町',to:'長野県諏訪郡下諏訪町' },
  { no:143, from:'長野県松本市',         to:'長野県上田市' },
  { no:144, from:'群馬県吾妻郡長野原町', to:'長野県上田市' },
  { no:145, from:'群馬県吾妻郡長野原町', to:'群馬県沼田市' },
  { no:146, from:'群馬県吾妻郡長野原町', to:'長野県北佐久郡軽井沢町' },
  { no:147, from:'長野県大町市',         to:'長野県松本市' },
  { no:148, from:'長野県大町市',         to:'新潟県糸魚川市' },
  { no:149, from:'静岡県静岡市清水区・清水港',to:'静岡県静岡市清水区大和町' },
  { no:150, from:'静岡県静岡市清水区',   to:'静岡県浜松市中央区' },
  { no:151, from:'長野県飯田市',         to:'愛知県豊橋市' },
  { no:152, from:'長野県上田市',         to:'静岡県浜松市中央区' },
  { no:153, from:'愛知県名古屋市東区',   to:'長野県塩尻市' },
  { no:154, from:'愛知県名古屋市港区・名古屋港',to:'愛知県名古屋市熱田区' },
  { no:155, from:'愛知県常滑市',         to:'愛知県弥富市' },
  { no:156, from:'岐阜県岐阜市',         to:'富山県高岡市' },
  { no:157, from:'石川県金沢市',         to:'岐阜県岐阜市' },
  { no:158, from:'福井県福井市',         to:'長野県松本市' },
  { no:159, from:'石川県七尾市',         to:'石川県金沢市' },
  { no:160, from:'石川県七尾市',         to:'富山県高岡市' },
  { no:161, from:'福井県敦賀市',         to:'滋賀県大津市' },
  { no:162, from:'京都府京都市右京区',   to:'福井県敦賀市' },
  { no:163, from:'大阪府大阪市北区',     to:'三重県津市' },
  { no:164, from:'三重県四日市市',       to:'三重県津市' },
  { no:165, from:'大阪府大阪市北区',     to:'三重県津市' },
  { no:166, from:'大阪府羽曳野市',       to:'三重県松阪市' },
  { no:167, from:'三重県志摩市',         to:'三重県伊勢市' },
  { no:168, from:'和歌山県新宮市',       to:'大阪府枚方市' },
  { no:169, from:'奈良県奈良市',         to:'和歌山県新宮市' },
  { no:170, from:'大阪府高槻市',         to:'大阪府泉佐野市' },
  { no:171, from:'京都府京都市南区',     to:'兵庫県神戸市中央区' },
  { no:172, from:'大阪府大阪市港区・大阪港',to:'大阪府大阪市中央区' },
  { no:173, from:'大阪府池田市',         to:'京都府綾部市' },
  { no:174, from:'兵庫県神戸市中央区・神戸港',to:'兵庫県神戸市中央区' },
  { no:175, from:'兵庫県明石市',         to:'京都府舞鶴市' },
  { no:176, from:'京都府宮津市',         to:'大阪府大阪市北区' },
  { no:177, from:'京都府舞鶴市・舞鶴港', to:'京都府舞鶴市字魚屋' },
  { no:178, from:'京都府舞鶴市',         to:'鳥取県岩美郡岩美町' },
  { no:179, from:'兵庫県姫路市',         to:'鳥取県東伯郡湯梨浜町' },
  { no:180, from:'岡山県岡山市北区',     to:'島根県松江市' },
  { no:181, from:'岡山県津山市',         to:'鳥取県米子市' },
  { no:182, from:'岡山県新見市',         to:'広島県福山市' },
  { no:183, from:'広島県広島市中区',     to:'鳥取県米子市' },
  { no:184, from:'島根県出雲市',         to:'広島県尾道市' },
  { no:185, from:'広島県呉市',           to:'広島県三原市' },
  { no:186, from:'島根県江津市',         to:'広島県大竹市' },
  { no:187, from:'山口県岩国市',         to:'島根県益田市' },
  { no:188, from:'山口県岩国市',         to:'山口県下松市' },
  { no:189, from:'山口県岩国市・岩国空港',to:'山口県岩国市麻里布町一丁目' },
  { no:190, from:'山口県山口市',         to:'山口県山陽小野田市' },
  { no:191, from:'山口県下関市',         to:'広島県広島市中区' },
  { no:192, from:'愛媛県西条市',         to:'徳島県徳島市' },
  { no:193, from:'香川県高松市',         to:'徳島県海部郡海陽町' },
  { no:194, from:'高知県高知市',         to:'愛媛県西条市' },
  { no:195, from:'高知県高知市',         to:'徳島県徳島市' },
  { no:196, from:'愛媛県松山市',         to:'愛媛県西条市' },
  { no:197, from:'高知県高知市',         to:'大分県大分市' },
  { no:198, from:'福岡県北九州市門司区', to:'福岡県北九州市門司区' },
  { no:199, from:'福岡県北九州市門司区', to:'福岡県北九州市八幡西区' },
  { no:200, from:'福岡県北九州市八幡西区',to:'福岡県筑紫野市' },
  { no:201, from:'福岡県福岡市東区',     to:'大分県日田市' },
  { no:202, from:'福岡県福岡市博多区',   to:'長崎県長崎市' },
  { no:203, from:'佐賀県唐津市',         to:'佐賀県佐賀市' },
  { no:204, from:'佐賀県唐津市',         to:'長崎県佐世保市' },
  { no:205, from:'長崎県佐世保市',       to:'長崎県東彼杵郡東彼杵町' },
  { no:206, from:'長崎県長崎市',         to:'長崎県佐世保市' },
  { no:207, from:'佐賀県佐賀市',         to:'長崎県西彼杵郡時津町' },
  { no:208, from:'熊本県熊本市中央区',   to:'佐賀県佐賀市' },
  { no:209, from:'福岡県大牟田市',       to:'福岡県久留米市' },
  { no:210, from:'福岡県久留米市',       to:'大分県大分市' },
  { no:211, from:'大分県日田市',         to:'福岡県北九州市八幡西区' },
  { no:212, from:'大分県中津市',         to:'熊本県阿蘇市' },
  { no:213, from:'大分県別府市',         to:'大分県中津市' },
  { no:217, from:'大分県大分市',         to:'大分県佐伯市' },
  { no:218, from:'熊本県熊本市中央区',   to:'宮崎県延岡市' },
  { no:219, from:'熊本県熊本市中央区',   to:'宮崎県宮崎市' },
  { no:220, from:'宮崎県宮崎市',         to:'鹿児島県霧島市' },
  { no:221, from:'宮崎県人吉市',         to:'宮崎県都城市' },
  { no:222, from:'宮崎県日南市',         to:'宮崎県都城市' },
  { no:223, from:'宮崎県小林市',         to:'鹿児島県霧島市' },
  { no:224, from:'鹿児島県鹿児島市',     to:'鹿児島県鹿児島市' },
  { no:225, from:'鹿児島県鹿児島市',     to:'鹿児島県枕崎市' },
  { no:226, from:'鹿児島県鹿児島市',     to:'鹿児島県南さつま市' },
  { no:227, from:'北海道函館市',         to:'北海道檜山郡江差町' },
  { no:228, from:'北海道函館市',         to:'北海道檜山郡江差町' },
  { no:229, from:'北海道小樽市',         to:'北海道檜山郡江差町' },
  { no:230, from:'北海道札幌市中央区',   to:'北海道久遠郡せたな町' },
  { no:231, from:'北海道札幌市北区',     to:'北海道留萌市' },
  { no:232, from:'北海道稚内市',         to:'北海道留萌市' },
  { no:233, from:'北海道旭川市',         to:'北海道留萌市' },
  { no:234, from:'北海道岩見沢市',       to:'北海道苫小牧市' },
  { no:235, from:'北海道室蘭市',         to:'北海道浦河郡浦河町' },
  { no:236, from:'北海道帯広市',         to:'北海道浦河郡浦河町' },
  { no:237, from:'北海道旭川市',         to:'北海道浦河郡浦河町' },
  { no:238, from:'北海道網走市',         to:'北海道稚内市' },
  { no:239, from:'北海道網走市',         to:'北海道留萌市' },
  { no:240, from:'北海道釧路市',         to:'北海道網走市' },
  { no:241, from:'北海道川上郡弟子屈町', to:'北海道帯広市' },
  { no:242, from:'北海道網走市',         to:'北海道帯広市' },
  { no:243, from:'北海道網走市',         to:'北海道根室市' },
  { no:244, from:'北海道網走市',         to:'北海道根室市' },
  { no:245, from:'茨城県水戸市',         to:'茨城県日立市' },
  { no:246, from:'東京都千代田区',       to:'静岡県沼津市' },
  { no:247, from:'愛知県名古屋市熱田区', to:'愛知県豊橋市' },
  { no:248, from:'愛知県蒲郡市',         to:'岐阜県岐阜市' },
  { no:249, from:'石川県七尾市',         to:'石川県金沢市' },
  { no:250, from:'兵庫県神戸市長田区',   to:'岡山県岡山市北区' },
  { no:251, from:'長崎県長崎市',         to:'長崎県諫早市' },
  { no:252, from:'新潟県柏崎市',         to:'福島県会津若松市' },
  { no:253, from:'新潟県上越市',         to:'新潟県南魚沼市' },
  { no:254, from:'東京都文京区',         to:'長野県松本市' },
  { no:255, from:'神奈川県秦野市',       to:'神奈川県小田原市' },
  { no:256, from:'岐阜県岐阜市',         to:'長野県飯田市' },
  { no:257, from:'静岡県浜松市中央区',   to:'岐阜県高山市' },
  { no:258, from:'岐阜県大垣市',         to:'三重県桑名市' },
  { no:259, from:'三重県鳥羽市',         to:'愛知県豊橋市' },
  { no:260, from:'三重県志摩市',         to:'三重県北牟婁郡紀北町' },
  { no:261, from:'広島県広島市中区',     to:'島根県江津市' },
  { no:262, from:'山口県萩市',           to:'山口県防府市' },
  { no:263, from:'福岡県福岡市早良区',   to:'佐賀県佐賀市' },
  { no:264, from:'佐賀県佐賀市',         to:'福岡県久留米市' },
  { no:265, from:'宮崎県小林市',         to:'熊本県阿蘇市' },
  { no:266, from:'熊本県天草市',         to:'熊本県熊本市' },
  { no:267, from:'熊本県人吉市',         to:'鹿児島県薩摩川内市' },
  { no:268, from:'熊本県熊本市',         to:'宮崎県宮崎市' },
  { no:269, from:'鹿児島県指宿市',       to:'宮崎県宮崎市' },
  { no:270, from:'鹿児島県枕崎市',       to:'鹿児島県いちき串木野市' },
  { no:271, from:'神奈川県小田原市',     to:'神奈川県厚木市' },
  { no:272, from:'北海道釧路市',         to:'北海道標津郡標津町' },
  { no:273, from:'北海道帯広市',         to:'北海道紋別市' },
  { no:274, from:'北海道札幌市北区',     to:'北海道川上郡標茶町' },
  { no:275, from:'北海道札幌市中央区',   to:'北海道枝幸郡浜頓別町' },
  { no:276, from:'北海道檜山郡江差町',   to:'北海道苫小牧市' },
  { no:277, from:'北海道檜山郡江差町',   to:'北海道二海郡八雲町' },
  { no:278, from:'北海道函館市',         to:'北海道茅部郡森町' },
  { no:279, from:'北海道函館市',         to:'青森県上北郡野辺地町' },
  { no:280, from:'青森県青森市',         to:'北海道函館市' },
  { no:281, from:'岩手県盛岡市',         to:'岩手県久慈市' },
  { no:282, from:'岩手県盛岡市',         to:'青森県平川市' },
  { no:283, from:'岩手県釜石市',         to:'岩手県花巻市' },
  { no:284, from:'岩手県陸前高田市',     to:'岩手県一関市' },
  { no:285, from:'秋田県秋田市',         to:'秋田県鹿角市' },
  { no:286, from:'宮城県仙台市太白区',   to:'山形県山形市' },
  { no:287, from:'山形県米沢市',         to:'山形県東根市' },
  { no:288, from:'福島県郡山市',         to:'福島県双葉郡双葉町' },
  { no:289, from:'新潟県新潟市中央区',   to:'福島県いわき市' },
  { no:290, from:'新潟県村上市',         to:'新潟県魚沼市' },
  { no:291, from:'群馬県前橋市',         to:'新潟県柏崎市' },
  { no:292, from:'群馬県吾妻郡長野原町', to:'新潟県妙高市' },
  { no:293, from:'茨城県日立市',         to:'栃木県足利市' },
  { no:294, from:'千葉県柏市',           to:'福島県会津若松市' },
  { no:295, from:'千葉県成田市・成田国際空港',to:'千葉県成田市' },
  { no:296, from:'千葉県匝瑳市',         to:'千葉県船橋市' },
  { no:297, from:'千葉県館山市',         to:'千葉県市原市' },
  { no:298, from:'埼玉県和光市',         to:'千葉県市川市' },
  { no:299, from:'長野県茅野市',         to:'埼玉県入間市' },
  { no:300, from:'山梨県富士吉田市',     to:'山梨県南巨摩郡身延町' },
  { no:301, from:'静岡県浜松市中央区',   to:'愛知県豊田市' },
  { no:302, from:'愛知県名古屋市中川区', to:'愛知県名古屋市中川区' },
  { no:303, from:'岐阜県岐阜市',         to:'福井県三方上中郡若狭町' },
  { no:304, from:'石川県金沢市',         to:'富山県南砺市' },
  { no:305, from:'石川県金沢市',         to:'福井県南条郡南越前町' },
  { no:306, from:'滋賀県彦根市',         to:'三重県津市' },
  { no:307, from:'滋賀県彦根市',         to:'大阪府枚方市' },
  { no:308, from:'大阪府大阪市中央区',   to:'奈良県奈良市' },
  { no:309, from:'三重県熊野市',         to:'大阪府大阪市平野区' },
  { no:310, from:'大阪府堺市堺区',       to:'奈良県五條市' },
  { no:311, from:'三重県尾鷲市',         to:'和歌山県西牟婁郡上富田町' },
  { no:312, from:'京都府宮津市',         to:'兵庫県姫路市' },
  { no:313, from:'広島県福山市',         to:'鳥取県東伯郡北栄町' },
  { no:314, from:'広島県福山市',         to:'島根県雲南市' },
  { no:315, from:'山口県周南市',         to:'山口県萩市' },
  { no:316, from:'山口県長門市',         to:'山口県山陽小野田市' },
  { no:317, from:'愛媛県松山市',         to:'広島県尾道市' },
  { no:318, from:'徳島県徳島市',         to:'香川県東かがわ市' },
  { no:319, from:'香川県坂出市',         to:'愛媛県四国中央市' },
  { no:320, from:'高知県宿毛市',         to:'愛媛県北宇和郡鬼北町' },
  { no:321, from:'高知県四万十市',       to:'高知県宿毛市' },
  { no:322, from:'福岡県北九州市小倉北区',to:'熊本県山鹿市' },
  { no:323, from:'佐賀県佐賀市',         to:'佐賀県唐津市' },
  { no:324, from:'長崎県長崎市',         to:'熊本県宇城市' },
  { no:325, from:'福岡県久留米市',       to:'熊本県阿蘇市' },
  { no:326, from:'宮崎県延岡市',         to:'大分県豊後大野市' },
  { no:327, from:'宮崎県日向市',         to:'熊本県阿蘇郡高森町' },
  { no:328, from:'鹿児島県鹿児島市',     to:'熊本県出水市' },
  { no:329, from:'沖縄県名護市',         to:'沖縄県那覇市' },
  { no:330, from:'沖縄県沖縄市',         to:'沖縄県那覇市' },
  { no:331, from:'沖縄県那覇市',         to:'沖縄県国頭郡大宜味村' },
  { no:332, from:'沖縄県那覇市・那覇空港',to:'沖縄県那覇市垣花町' },
  { no:333, from:'北海道旭川市',         to:'北海道北見市' },
  { no:334, from:'北海道目梨郡羅臼町',   to:'北海道網走郡美幌町' },
  { no:335, from:'北海道目梨郡羅臼町',   to:'北海道標津郡標津町' },
  { no:336, from:'北海道浦河郡浦河町',   to:'北海道釧路市' },
  { no:337, from:'北海道千歳市',         to:'北海道小樽市' },
  { no:338, from:'北海道函館市',         to:'青森県上北郡おいらせ町' },
  { no:339, from:'青森県弘前市',         to:'青森県東津軽郡外ヶ浜町' },
  { no:340, from:'岩手県陸前高田市',     to:'青森県八戸市' },
  { no:341, from:'秋田県鹿角市',         to:'秋田県由利本荘市' },
  { no:342, from:'秋田県横手市',         to:'宮城県登米市' },
  { no:343, from:'岩手県陸前高田市',     to:'岩手県奥州市' },
  { no:344, from:'秋田県湯沢市',         to:'山形県酒田市' },
  { no:345, from:'新潟県新潟市中央区',   to:'山形県飽海郡遊佐町' },
  { no:346, from:'宮城県仙台市青葉区',   to:'宮城県気仙沼市' },
  { no:347, from:'山形県寒河江市',       to:'宮城県大崎市' },
  { no:348, from:'山形県長井市',         to:'山形県山形市' },
  { no:349, from:'茨城県水戸市',         to:'宮城県柴田郡柴田町' },
  { no:350, from:'新潟県新潟市中央区',   to:'新潟県上越市' },
  { no:351, from:'新潟県長岡市',         to:'新潟県小千谷市' },
  { no:352, from:'新潟県柏崎市',         to:'栃木県河内郡上三川町' },
  { no:353, from:'群馬県桐生市',         to:'新潟県柏崎市' },
  { no:354, from:'群馬県高崎市',         to:'茨城県鉾田市' },
  { no:355, from:'千葉県香取市',         to:'茨城県笠間市' },
  { no:356, from:'千葉県銚子市',         to:'千葉県我孫子市' },
  { no:357, from:'千葉県千葉市中央区',   to:'神奈川県横須賀市' },
  { no:358, from:'山梨県南都留郡富士河口湖町',to:'山梨県甲府市' },
  { no:359, from:'富山県富山市',         to:'石川県金沢市' },
  { no:360, from:'富山県富山市',         to:'石川県小松市' },
  { no:361, from:'岐阜県高山市',         to:'長野県伊那市' },
  { no:362, from:'愛知県豊川市',         to:'静岡県静岡市葵区' },
  { no:363, from:'愛知県名古屋市名東区', to:'岐阜県中津川市' },
  { no:364, from:'福井県大野市',         to:'石川県加賀市' },
  { no:365, from:'石川県加賀市',         to:'三重県四日市市' },
  { no:366, from:'愛知県半田市',         to:'愛知県名古屋市緑区' },
  { no:367, from:'京都府京都市下京区',   to:'福井県三方上中郡若狭町' },
  { no:368, from:'三重県伊賀市',         to:'三重県多気郡多気町' },
  { no:369, from:'奈良県奈良市',         to:'三重県松阪市' },
  { no:370, from:'和歌山県海南市',       to:'奈良県奈良市' },
  { no:371, from:'大阪府河内長野市',     to:'和歌山県東牟婁郡串本町' },
  { no:372, from:'京都府亀岡市',         to:'兵庫県姫路市' },
  { no:373, from:'兵庫県赤穂市',         to:'鳥取県鳥取市' },
  { no:374, from:'岡山県備前市',         to:'岡山県津山市' },
  { no:375, from:'広島県呉市',           to:'島根県大田市' },
  { no:376, from:'山口県山口市',         to:'山口県岩国市' },
  { no:377, from:'徳島県鳴門市',         to:'香川県観音寺市' },
  { no:378, from:'愛媛県伊予市',         to:'愛媛県宇和島市' },
  { no:379, from:'愛媛県松山市',         to:'愛媛県喜多郡内子町' },
  { no:380, from:'愛媛県八幡浜市',       to:'愛媛県上浮穴郡久万高原町' },
  { no:381, from:'高知県須崎市',         to:'愛媛県宇和島市' },
  { no:382, from:'長崎県対馬市',         to:'佐賀県唐津市' },
  { no:383, from:'長崎県平戸市',         to:'佐賀県伊万里市' },
  { no:384, from:'長崎県五島市',         to:'長崎県佐世保市' },
  { no:385, from:'福岡県柳川市',         to:'福岡県福岡市博多区' },
  { no:386, from:'大分県日田市',         to:'福岡県筑紫野市' },
  { no:387, from:'大分県宇佐市',         to:'熊本県熊本市北区' },
  { no:388, from:'大分県佐伯市',         to:'熊本県球磨郡湯前町' },
  { no:389, from:'福岡県大牟田市',       to:'鹿児島県阿久根市' },
  { no:390, from:'沖縄県石垣市',         to:'沖縄県那覇市' },
  { no:391, from:'北海道釧路市',         to:'北海道網走市' },
  { no:392, from:'北海道釧路市',         to:'北海道中川郡本別町' },
  { no:393, from:'北海道小樽市',         to:'北海道虻田郡倶知安町' },
  { no:394, from:'青森県むつ市',         to:'青森県弘前市' },
  { no:395, from:'岩手県久慈市',         to:'岩手県二戸市' },
  { no:396, from:'岩手県遠野市',         to:'岩手県盛岡市' },
  { no:397, from:'岩手県大船渡市',       to:'秋田県横手市' },
  { no:398, from:'宮城県石巻市',         to:'秋田県由利本荘市' },
  { no:399, from:'福島県いわき市',       to:'山形県南陽市' },
  { no:400, from:'茨城県水戸市',         to:'栃木県那須塩原市' },
  { no:401, from:'福島県会津若松市',     to:'新潟県村上市' },
  { no:402, from:'新潟県柏崎市',         to:'新潟県新潟市中央区' },
  { no:403, from:'新潟県新潟市中央区',   to:'長野県松本市' },
  { no:404, from:'新潟県長岡市',         to:'新潟県上越市' },
  { no:405, from:'群馬県吾妻郡長野原町', to:'新潟県上越市' },
  { no:406, from:'長野県長野市',         to:'群馬県高崎市' },
  { no:407, from:'埼玉県入間郡毛呂山町', to:'栃木県足利市' },
  { no:408, from:'千葉県成田市',         to:'栃木県塩谷郡高根沢町' },
  { no:409, from:'神奈川県川崎市川崎区', to:'千葉県成田市' },
  { no:410, from:'千葉県館山市',         to:'千葉県木更津市' },
  { no:411, from:'東京都八王子市',       to:'山梨県甲府市' },
  { no:412, from:'神奈川県平塚市',       to:'神奈川県相模原市' },
  { no:413, from:'山梨県富士吉田市',     to:'神奈川県相模原市' },
  { no:414, from:'静岡県下田市',         to:'静岡県沼津市' },
  { no:415, from:'石川県羽咋市',         to:'富山県富山市' },
  { no:416, from:'福井県福井市',         to:'石川県小松市' },
  { no:417, from:'岐阜県大垣市',         to:'福井県南条郡南越前町' },
  { no:418, from:'福井県大野市',         to:'長野県飯田市' },
  { no:419, from:'岐阜県瑞浪市',         to:'愛知県高浜市' },
  { no:420, from:'愛知県豊田市',         to:'愛知県新城市' },
  { no:421, from:'三重県桑名市',         to:'滋賀県近江八幡市' },
  { no:422, from:'滋賀県大津市',         to:'三重県尾鷲市' },
  { no:423, from:'大阪府大阪市北区',     to:'京都府亀岡市' },
  { no:424, from:'和歌山県田辺市',       to:'和歌山県紀の川市' },
  { no:425, from:'三重県尾鷲市',         to:'和歌山県御坊市' },
  { no:426, from:'兵庫県豊岡市',         to:'京都府福知山市' },
  { no:427, from:'兵庫県明石市',         to:'兵庫県朝来市' },
  { no:428, from:'兵庫県神戸市中央区',   to:'兵庫県三木市' },
  { no:429, from:'岡山県倉敷市',         to:'京都府福知山市' },
  { no:430, from:'岡山県倉敷市',         to:'岡山県玉野市' },
  { no:431, from:'島根県出雲市',         to:'鳥取県米子市' },
  { no:432, from:'広島県竹原市',         to:'島根県松江市' },
  { no:433, from:'広島県大竹市',         to:'広島県三次市' },
  { no:434, from:'山口県周南市',         to:'広島県三次市' },
  { no:435, from:'山口県山口市',         to:'山口県下関市' },
  { no:436, from:'兵庫県姫路市',         to:'香川県高松市' },
  { no:437, from:'愛媛県松山市',         to:'山口県岩国市' },
  { no:438, from:'徳島県徳島市',         to:'香川県坂出市' },
  { no:439, from:'徳島県徳島市',         to:'高知県四万十市' },
  { no:440, from:'愛媛県松山市',         to:'高知県高岡郡檮原町' },
  { no:441, from:'愛媛県大洲市',         to:'高知県四万十市' },
  { no:442, from:'大分県大分市',         to:'福岡県大川市' },
  { no:443, from:'福岡県大川市',         to:'熊本県八代郡氷川町' },
  { no:444, from:'長崎県大村市',         to:'佐賀県佐賀市' },
  { no:445, from:'熊本県熊本市中央区',   to:'熊本県人吉市' },
  { no:446, from:'宮崎県日向市',         to:'熊本県球磨郡湯前町' },
  { no:447, from:'宮崎県えびの市',       to:'鹿児島県出水市' },
  { no:448, from:'鹿児島県指宿市',       to:'宮崎県宮崎市' },
  { no:449, from:'沖縄県国頭郡本部町',   to:'沖縄県名護市' },
  { no:450, from:'北海道旭川市',         to:'北海道紋別市' },
  { no:451, from:'北海道留萌市',         to:'北海道滝川市' },
  { no:452, from:'北海道夕張市',         to:'北海道旭川市' },
  { no:453, from:'北海道札幌市豊平区',   to:'北海道伊達市' },
  { no:454, from:'青森県八戸市',         to:'青森県南津軽郡大鰐町' },
  { no:455, from:'岩手県盛岡市',         to:'岩手県下閉伊郡岩泉町' },
  { no:456, from:'岩手県盛岡市',         to:'宮城県気仙沼市' },
  { no:457, from:'岩手県一関市',         to:'宮城県白石市' },
  { no:458, from:'山形県新庄市',         to:'山形県上山市' },
  { no:459, from:'新潟県新潟市中央区',   to:'福島県双葉郡浪江町' },
  { no:460, from:'新潟県新発田市',       to:'新潟県柏崎市' },
  { no:461, from:'栃木県日光市',         to:'茨城県高萩市' },
  { no:462, from:'長野県佐久市',         to:'群馬県伊勢崎市' },
  { no:463, from:'埼玉県越谷市',         to:'埼玉県入間市' },
  { no:464, from:'千葉県松戸市',         to:'千葉県成田市' },
  { no:465, from:'千葉県茂原市',         to:'千葉県富津市' },
  { no:466, from:'東京都世田谷区',       to:'神奈川県横浜市保土ケ谷区' },
  { no:467, from:'神奈川県大和市',       to:'神奈川県藤沢市' },
  { no:468, from:'神奈川県横浜市金沢区', to:'千葉県木更津市' },
  { no:469, from:'静岡県御殿場市',       to:'静岡県富士市' },
  { no:470, from:'石川県輪島市',         to:'石川県七尾市' },
  { no:471, from:'石川県羽咋市',         to:'岐阜県高山市' },
  { no:472, from:'富山県高岡市',         to:'岐阜県郡上市' },
  { no:473, from:'愛知県蒲郡市',         to:'静岡県牧之原市' },
  { no:474, from:'長野県飯田市',         to:'静岡県浜松市浜名区' },
  { no:475, from:'愛知県豊田市',         to:'三重県四日市市' },
  { no:476, from:'福井県大野市',         to:'福井県敦賀市' },
  { no:477, from:'三重県四日市市',       to:'大阪府池田市' },
  { no:478, from:'京都府宮津市',         to:'京都府久世郡久御山町' },
  { no:479, from:'大阪府豊中市',         to:'大阪府大阪市住之江区' },
  { no:480, from:'大阪府泉大津市',       to:'和歌山県有田市' },
  { no:481, from:'大阪府泉佐野市・関西国際空港',to:'大阪府泉佐野市上之郷' },
  { no:482, from:'京都府宮津市',         to:'鳥取県米子市' },
  { no:483, from:'兵庫県豊岡市',         to:'兵庫県丹波市' },
  { no:484, from:'岡山県備前市',         to:'岡山県高梁市' },
  { no:485, from:'島根県隠岐郡隠岐の島町',to:'島根県松江市' },
  { no:486, from:'岡山県総社市',         to:'広島県東広島市' },
  { no:487, from:'広島県呉市',           to:'広島県広島市南区' },
  { no:488, from:'島根県益田市',         to:'広島県廿日市市' },
  { no:489, from:'山口県周南市',         to:'山口県山口市' },
  { no:490, from:'山口県宇部市',         to:'山口県萩市' },
  { no:491, from:'山口県下関市',         to:'山口県長門市' },
  { no:492, from:'香川県高松市',         to:'徳島県美馬市' },
  { no:493, from:'高知県安芸市',         to:'高知県高知市' },
  { no:494, from:'愛媛県松山市',         to:'高知県須崎市' },
  { no:495, from:'福岡県北九州市若松区', to:'福岡県福岡市東区' },
  { no:496, from:'大分県日田市',         to:'福岡県行橋市' },
  { no:497, from:'長崎県佐世保市',       to:'長崎県松浦市' },
  { no:498, from:'佐賀県鹿島市',         to:'長崎県佐世保市' },
  { no:499, from:'長崎県長崎市',         to:'鹿児島県阿久根市' },
  { no:500, from:'佐賀県鳥栖市',         to:'大分県別府市' },
  { no:501, from:'福岡県大牟田市',       to:'熊本県宇土市' },
  { no:502, from:'大分県臼杵市',         to:'大分県竹田市' },
  { no:503, from:'熊本県阿蘇郡高森町',   to:'宮崎県延岡市' },
  { no:504, from:'鹿児島県鹿屋市',       to:'鹿児島県出水市' },
  { no:505, from:'沖縄県国頭郡本部町',   to:'沖縄県名護市' },
  { no:506, from:'沖縄県那覇市',         to:'沖縄県中頭郡西原町' },
  { no:507, from:'沖縄県糸満市',         to:'沖縄県那覇市' },
];

// ===== 特殊フォントが必要な形式のfontFamilyスタイルを返す =====
const SPECIAL_FONT_STYLES: Record<string, React.CSSProperties> = {
  tangut:            { fontFamily: "'Noto Serif Tangut', serif" },
  sinhala:           { fontFamily: "'Noto Sans Sinhala', sans-serif" },
  sinhala_archaic:   { fontFamily: "'Noto Sans Sinhala', sans-serif" },
  kharoshthi:        { fontFamily: "'Noto Sans Kharoshthi', 'Segoe UI Historic', sans-serif" },
  mandaic:           { fontFamily: "'Noto Sans Mandaic', 'Segoe UI Historic', sans-serif" },
  old_south_arabian: { fontFamily: "'Noto Sans Old South Arabian', 'Segoe UI Historic', sans-serif" },
  bassa_vah:         { fontFamily: "'Noto Sans Bassa Vah', sans-serif" },
  dogra:             { fontFamily: "'Noto Serif Dogra', sans-serif" },
  dives_akuru:       { fontFamily: "'Noto Sans Dives Akuru', sans-serif" },
};
const getNumberFontStyle = (format: string): React.CSSProperties =>
  SPECIAL_FONT_STYLES[format] ?? {};

const App = () => {
  const [myUid] = useState<string>(() => getOrCreateUid());
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
  const [teamNames, setTeamNames] = useState(['チームA','チームB','チームC','チームD','チームE','チームF']);
  const [playerListText, setPlayerListText] = useState('');
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
    'reverseMode','multiMode','numberFormat','feint',
    'diceMode','reverseHealDamage','instantDeath','trueRandom'
  ]);
  const [isHpBalanceEnabled, setIsHpBalanceEnabled] = useState(true);
  const [isBarrierEventEnabled, setIsBarrierEventEnabled] = useState(true); // 無敵バリアカードイベント
  const [isRoadEventEnabled, setIsRoadEventEnabled] = useState(true); // 国道ダメージ/回復イベント
  const [isSpecialMultiEnabled, setIsSpecialMultiEnabled] = useState(false); // 特別イベント重複発動
  const [specialMultiProb, setSpecialMultiProb] = useState(30); // 重複発動確率（%）
  const [isSpectatorMode, setIsSpectatorMode] = useState(false); // 観戦モード（ホストのみ）

  // マルチイベント（爆弾・クイズ）は廃止済み

  // numberFormat は spinRoulette 内でローカル変数として使うため
  // state は「表示バッジ用」のみ
  const [activeNumberFormat, setActiveNumberFormat] = useState('default');

  const ALL_NUMBER_FORMATS = [
    // ── アジア系 ──
    { id: 'roman',           label: 'ローマ数字' },
    { id: 'greek',           label: 'ギリシャ数字' },
    { id: 'kanji',           label: '漢数字' },
    { id: 'daiji',           label: '大字（漢数字）' },
    { id: 'suzhou',          label: '蘇州数字（商業用）' },
    // ── インド系 ──
    { id: 'indic',           label: 'インド数字（デーヴァ）' },
    { id: 'devanagari',      label: 'デーヴァナーガリー数字' },
    { id: 'bengali',         label: 'ベンガル数字' },
    { id: 'gujarati',        label: 'グジャラート数字' },
    { id: 'gurmukhi',        label: 'グルムキー数字' },
    { id: 'kannada',         label: 'カンナダ数字' },
    { id: 'telugu',          label: 'テルグ数字' },
    { id: 'malayalam',       label: 'マラヤーラム数字' },
    { id: 'oriya',           label: 'オリヤー数字' },
    { id: 'tamil',           label: 'タミル数字' },
    { id: 'sinhala',         label: 'シンハラ数字' },
    { id: 'sinhala_archaic',  label: 'シンハラ古形数字 ✦' },
    { id: 'kharoshthi',       label: 'カローシュティー数字 ✦' },
    { id: 'brahmi',          label: 'ブラーフミー数字' },
    { id: 'sora_sompeng',    label: 'ソラ・ソンペン数字' },
    { id: 'chakma',          label: 'チャクマ数字' },
    { id: 'sharada',         label: 'シャーラダー数字' },
    { id: 'takri',           label: 'タクリ数字' },
    { id: 'modi',            label: 'モディ数字' },
    { id: 'tirhuta',         label: 'ティルフタ数字' },
    { id: 'warang_citi',     label: 'ワランチティ数字' },
    { id: 'adlam',           label: 'アドラム数字' },
    { id: 'dogra',           label: 'ドグラ数字 ✦' },
    { id: 'dives_akuru',     label: 'ディベス・アクル数字 ✦' },
    { id: 'masaram_gondi',   label: 'マサラム・ゴンディ数字' },
    { id: 'gunjala_gondi',   label: 'グンジャラ・ゴンディ数字' },
    { id: 'kaithi',          label: 'カイティ数字' },
    { id: 'mahajani',        label: 'マハージャニー数字' },
    // ── 東南アジア・中央アジア ──
    { id: 'thai',            label: 'タイ数字' },
    { id: 'myanmar',         label: 'ミャンマー数字' },
    { id: 'myanmar_shan',    label: 'ミャンマー・シャン数字' },
    { id: 'myanmar_tai_laing', label: 'ミャンマー・タイレー数字' },
    { id: 'khmer',           label: 'クメール数字' },
    { id: 'lao',             label: 'ラオ数字' },
    { id: 'tibetan',         label: 'チベット数字' },
    { id: 'mongolian',       label: 'モンゴル数字' },
    { id: 'tai_tham',        label: 'タイ・タム（ホラ）数字' },
    { id: 'tai_tham2',       label: 'タイ・タム（タム）数字' },
    { id: 'limbu',           label: 'リンブ数字' },
    { id: 'new_tai_lue',     label: 'ニュータイルー数字' },
    { id: 'balinese',        label: 'バリ数字' },
    { id: 'sundanese',       label: 'スンダ数字' },
    { id: 'javanese',        label: 'ジャワ数字' },
    { id: 'cham',            label: 'チャム数字' },
    { id: 'lepcha',          label: 'レプチャ数字' },
    { id: 'ol_chiki',        label: 'オルチキ数字' },
    { id: 'meetei',          label: 'メイテイ・マイェク数字' },
    { id: 'pahawh_hmong',    label: 'パハウ・フモン数字' },
    // ── 中東・アフリカ系 ──
    { id: 'arabic_eastern',  label: 'アラビア文字数字（東）' },
    { id: 'persian',         label: 'ペルシア数字' },
    { id: 'nko',             label: 'ンコ数字' },
    { id: 'osmanya',         label: 'オスマニア数字' },
    { id: 'ethiopic',        label: 'エチオピア数字（ゲエズ）' },
    { id: 'vai',             label: 'ヴァイ数字' },
    { id: 'mandaic',          label: 'マンダ文字数字 ✦' },
    { id: 'old_south_arabian',label: '古代南アラビア数字 ✦' },
    { id: 'bassa_vah',        label: 'バサ・ヴァ数字 ✦' },
    // ── 古代文字 ──
    { id: 'tangut',           label: '西夏文字数字 ✦' },
    { id: 'babylonian',      label: 'バビロニア数字（楔形）' },
    { id: 'mayan',           label: 'マヤ数字' },
    { id: 'egyptian',        label: 'エジプト象形数字' },
    { id: 'hebrew',          label: 'ヘブライ数字' },
    { id: 'armenian',        label: 'アルメニア数字' },
    { id: 'georgian',        label: 'ジョージア数字' },
    // ── 特殊文字・記号数字 ──
    { id: 'fullwidth',       label: '全角数字' },
    { id: 'circled',         label: '丸囲み数字（白地）' },
    { id: 'black_circled',   label: '黒丸数字' },
    { id: 'parenthesized',   label: '括弧付き数字' },
    { id: 'dotted',          label: 'ドット付き数字' },
    { id: 'counting_rod',    label: 'カウントロッド数字' },
    { id: 'superscript',     label: '上付き数字' },
    { id: 'subscript',       label: '下付き数字' },
    { id: 'bold_digit',      label: '太字数字' },
    { id: 'double_struck',   label: '黒板太字数字' },
    { id: 'sans_serif',      label: 'サンセリフ数字' },
    { id: 'sans_bold',       label: 'サンセリフ太字数字' },
    { id: 'monospace',       label: '等幅数字' },
    // ── その他アジア文字圏 ──
    { id: 'saurashtra',      label: 'サウルシュトラ数字' },
    { id: 'kayah_li',        label: 'カヤー数字' },
  ];


  // diceConfig: min=ダイス面数下限, max=ダイス面数上限, diceCount=個数
  // diceConfig: minCount〜maxCount個のダイスをランダム個振る、各1〜diceMax面
  const [diceConfig, setDiceConfig] = useState({ minCount: 1, maxCount: 10, faceMin: 1, faceMax: 100 });
  const [enabledFormats, setEnabledFormats] = useState(ALL_NUMBER_FORMATS.map(f => f.id));

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
  // バリアメガ付与演出フェーズ ('fadeout' | 'result' | 'fadein' | null)
  const [barrierMegaAnimPhase, setBarrierMegaAnimPhase] = useState<'fadeout'|'result'|'fadein'|null>(null);
  const [barrierMegaTarget, setBarrierMegaTarget] = useState<string>('');
  const [isLogsCopied, setIsLogsCopied] = useState(false);
  const [isRankingCopied, setIsRankingCopied] = useState(false);
  const [isDiscordCopied, setIsDiscordCopied] = useState(false);
  const [draggedPlayer, setDraggedPlayer] = useState<Player | ManualPlayer | null>(null);
  const [touchTargetTeam, setTouchTargetTeam] = useState<number | null>(null);

  // ===== ローカル文字列state（数値入力用：onBlurで確定） =====
  const [localTeamCount, setLocalTeamCount] = useState('2');
  const [localInitialHP, setLocalInitialHP] = useState('1000');
  const [localSpinDuration, setLocalSpinDuration] = useState('1.5');
  const [localHealInterval, setLocalHealInterval] = useState('10');
  const [localSpecialEventProb, setLocalSpecialEventProb] = useState('25');
  const [localRangeMin, setLocalRangeMin] = useState('1');
  const [localRangeMax, setLocalRangeMax] = useState('200');
  const [localRangeProb, setLocalRangeProb] = useState('70');
  const [localDiceMinCount, setLocalDiceMinCount] = useState('1');
  const [localDiceMaxCount, setLocalDiceMaxCount] = useState('1');
  const [localDiceFaceMin, setLocalDiceFaceMin] = useState('1');
  const [localDiceFaceMax, setLocalDiceFaceMax] = useState('6');
  // 復活イベントのターン入力用ローカルstring（入力中は文字列保持、確定時のみ数値に変換）
  const [reviveTurnInputs, setReviveTurnInputs] = useState<Record<number, string>>({ 1: '50', 2: '100' });

  // ===== 数値state→ローカルstring state同期（syncSettingsFromRoom対応） =====
  useEffect(() => { setLocalTeamCount(String(teamCount)); }, [teamCount]);
  useEffect(() => { setLocalInitialHP(String(initialHP)); }, [initialHP]);
  useEffect(() => { setLocalSpinDuration(String(spinDuration)); }, [spinDuration]);
  useEffect(() => { setLocalHealInterval(String(healInterval)); }, [healInterval]);
  useEffect(() => { setLocalSpecialEventProb(String(specialEventProb)); }, [specialEventProb]);
  useEffect(() => { setLocalRangeMin(String(config.rangeMin)); }, [config.rangeMin]);
  useEffect(() => { setLocalRangeMax(String(config.rangeMax)); }, [config.rangeMax]);
  useEffect(() => { setLocalRangeProb(String(config.rangeProb)); }, [config.rangeProb]);
  useEffect(() => { setLocalDiceMinCount(String(diceConfig.minCount)); }, [diceConfig.minCount]);
  useEffect(() => { setLocalDiceMaxCount(String(diceConfig.maxCount)); }, [diceConfig.maxCount]);
  // reviveEventsが変わった時（追加/削除）にローカルstateも同期
  useEffect(() => {
    setReviveTurnInputs(prev => {
      const next: Record<number, string> = {};
      reviveEvents.forEach(r => { next[r.id] = prev[r.id] !== undefined ? prev[r.id] : String(r.turn); });
      return next;
    });
  }, [reviveEvents.map(r => r.id).join(',')]);
  useEffect(() => { setLocalDiceFaceMin(String(diceConfig.faceMin)); }, [diceConfig.faceMin]);
  useEffect(() => { setLocalDiceFaceMax(String(diceConfig.faceMax)); }, [diceConfig.faceMax]);

  // ===== KVポーリング（1秒間隔） =====
  useEffect(() => {
    if (!currentRoomId) return;
    const poll = async () => {
      try {
        const data = await API.getRoom(currentRoomId);
        if (!data) return;
        setRoomHostId(data.hostId);
        setIsMultiplayer(true); // ルームに接続している間は常にマルチプレイ
        if (data.status === 'joining') {
          syncSettingsFromRoom(data.settings);
          setPlayers(data.players);
          setPhase(prev => (prev !== 'multi_lobby' && prev !== 'multi_name') ? 'multi_lobby' : prev);
        }
        if (data.status === 'playing') {
          setPhase(prev => prev !== 'playing' ? 'playing' : prev);
          setPlayers(data.players); setTurn(data.gameState.turn);
          setLogs(data.gameState.logs); setEliminated(data.gameState.eliminated);
          setIsSpinning(data.gameState.isSpinning);
          setDisplayResult(data.gameState.displayResult); setLastResult(data.gameState.lastResult);
          // (マルチイベント同期コード廃止済み)
        }
        if (data.status === 'result') {
          setPhase(prev => prev !== 'result' ? 'result' : prev);
          setPlayers(data.players); setLogs(data.gameState.logs); setEliminated(data.gameState.eliminated);
        }
        // オーナー退室 → 全員強制終了
        if (data.status === 'closed') {
          alert('ホストがゲームを終了しました。');
          setPhase('home'); setIsMultiplayer(false); setCurrentRoomId(null); setRoomHostId(null);
          setPlayers([]); setEliminated([]); setLogs([]); setTurn(1);
          setDisplayResult({ player: '？？？', amount: '？' }); setLastResult(null);
          setIsSpectatorMode(false);
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, [currentRoomId]);

  useEffect(() => {
    if (lastResult?.targetIds) {
      setAnimatingPlayerIds(lastResult.targetIds);
      setAnimatingType(lastResult.type);
      const t = setTimeout(() => { setAnimatingPlayerIds([]); setAnimatingType(null); }, 2000);
      return () => clearTimeout(t);
    }
  }, [lastResult]);

  // マルチ非ホスト用のスピン演出
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isMultiplayer && isSpinning && myUid !== roomHostId && phase === 'playing') {
      interval = setInterval(() => {
        const alive = players.filter(p => p.status === 'alive');
        if (alive.length > 0) {
          const p = alive[Math.floor(Math.random() * alive.length)];
          setDisplayResult({ player: p.name, amount: Math.floor(Math.random() * 999) });
        }
      }, 60);
    }
    return () => clearInterval(interval);
  }, [isMultiplayer, isSpinning, myUid, roomHostId, players, phase]);

  const syncSettingsFromRoom = (s: any) => {
    if (!s) return;
    // 基本設定（nullチェック付きでデフォルト値を使用）
    setTitle(s.title || '');
    setMode(s.mode || 'individual');
    setTeamCount(s.teamCount ?? 2);
    setTeamNames(s.teamNames || ['チームA','チームB','チームC','チームD','チームE','チームF']);
    setInitialHP(s.initialHP ?? 1000);
    setSpinDuration(s.spinDuration ?? 1.5);
    setHealInterval(s.healInterval ?? 10);
    setIsHpBalanceEnabled(s.isHpBalanceEnabled ?? true);
    setIsSpecialEventEnabled(s.isSpecialEventEnabled ?? true);
    setSpecialEventProb(s.specialEventProb ?? 25);
    setEnabledSpecialEvents(s.enabledSpecialEvents || []);
    // diceConfigの後方互換性（旧形式 {min,max,diceCount} → 新形式 {minCount,maxCount,faceMin,faceMax}）
    if (s.diceConfig) {
      if ('minCount' in s.diceConfig) { setDiceConfig(s.diceConfig); }
      else { setDiceConfig({ minCount: s.diceConfig.diceCount||2, maxCount: s.diceConfig.diceCount||2, faceMin: s.diceConfig.min||1, faceMax: s.diceConfig.max||100 }); }
    }
    if (s.enabledFormats) setEnabledFormats(s.enabledFormats);
    // configはfixedItemsが必須なので、undefinedの場合はスキップ（デフォルト値を維持）
    if (s.config && s.config.fixedItems) setConfig(s.config);
    // reviveEventsはundefinedの場合は空配列で設定
    setReviveEvents(Array.isArray(s.reviveEvents) ? s.reviveEvents : []);
    if (s.isBarrierEventEnabled !== undefined) setIsBarrierEventEnabled(s.isBarrierEventEnabled);
    if (s.isRoadEventEnabled !== undefined) setIsRoadEventEnabled(s.isRoadEventEnabled);
    if (s.isSpecialMultiEnabled !== undefined) setIsSpecialMultiEnabled(s.isSpecialMultiEnabled);
    if (s.specialMultiProb !== undefined) setSpecialMultiProb(s.specialMultiProb);
  };

  const toggleSpecialEvent = (type: string) =>
    setEnabledSpecialEvents(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);

  const totalProb = (parseInt(String(config.rangeProb)) || 0) +
    config.fixedItems.reduce((s, i) => s + (parseInt(String(i.prob)) || 0), 0);
  // isHostはコンポーネントスコープで1度だけ定義（TDZ防止）
  // setup フェーズ（roomHostId=null）もホスト扱いとする
  const isHost = isMultiplayer ? (roomHostId === null || myUid === roomHostId) : true;
  const isManualTurn = !isMultiplayer && isManualModeEnabled && ((turn >= 41 && turn <= 49) || (turn >= 51 && turn <= 60));

  useEffect(() => {
    if (!isMultiplayer) {
      const names = playerListText.split('\n').map(n => n.trim()).filter(Boolean);
      const unique = [...new Set(names)];
      setManualPlayers(prev => unique.map((name, i) => {
        const ex = prev.find(p => p.name === name);
        return ex ?? { name, teamIndex: mode === 'team' ? i % teamCount : 0 };
      }));
    }
  }, [playerListText, teamCount, mode, isMultiplayer]);

  // ===== 数量生成 =====
  const generateAmount = (): number => {
    const r = Math.random() * 100;
    let cur = parseInt(String(config.rangeProb)) || 0;
    const mn = parseInt(String(config.rangeMin)) || 1;
    const mx = parseInt(String(config.rangeMax)) || 200;
    if (r < cur) return Math.floor(Math.random() * (mx - mn + 1)) + mn;
    for (const item of config.fixedItems) {
      cur += parseInt(String(item.prob)) || 0;
      if (r < cur) return parseInt(String(item.value)) || 0;
    }
    return mx;
  };

  // ===== ダイス生成（Nd : diceCount個, 各1〜max面） =====
  const generateDiceAmount = (): { rolls: number[]; total: number; faceMax: number } => {
    const count = Math.min(diceConfig.maxCount, Math.max(diceConfig.minCount,
      diceConfig.minCount + Math.floor(Math.random() * (diceConfig.maxCount - diceConfig.minCount + 1))));
    const rolls: number[] = [];
    for (let i = 0; i < count; i++) {
      rolls.push(Math.floor(Math.random() * (diceConfig.faceMax - diceConfig.faceMin + 1)) + diceConfig.faceMin);
    }
    return { rolls, total: rolls.reduce((s, v) => s + v, 0), faceMax: diceConfig.faceMax };
  };

  // ===== ダイス表示文字列 =====
  const formatDiceDisplay = (rolls: number[], fmt: string, faceMax?: number): string => {
    const total = rolls.reduce((s, v) => s + v, 0);
    const fMax = faceMax ?? diceConfig.faceMax;
    const fMin = diceConfig.faceMin;
    const totalStr = String(convertNumber(total, fmt));
    const diceNotation = `${rolls.length}d${fMin > 1 ? fMin + '~' : ''}${fMax}`;
    return `${totalStr}  [${diceNotation}]`;
  };

  const copyToClipboard = (text: string, setFeedback: (v: boolean) => void) => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); setFeedback(true); setTimeout(() => setFeedback(false), 2000); } catch {}
    document.body.removeChild(ta);
  };

  const copyRanking = () => {
    const ranking = getCombinedRanking();
    const alive = players.filter(p => p.status === 'alive');
    const winnerTeam = mode === 'team' && alive.length > 0 ? `${alive[0].team}の勝利！\n` : '';
    const text = `${title}\nランキング結果［第${turn}ターンで終了］\n${winnerTeam}` +
      ranking.map((p, i) => `${i+1}位:${p.team?`［${p.team}］`:''}${p.name}${p.status==='alive'?`［ライフ${p.hp}で生存］`:`［第${(p as any).turn}ターンで脱落］`}`).join('\n');
    copyToClipboard(text, setIsRankingCopied);
  };
  const copyDiscordRanking = () => {
    const ranking = getCombinedRanking();
    const alive = players.filter(p => p.status === 'alive');
    const winnerTeam = mode === 'team' && alive.length > 0 ? `**${alive[0].team}の勝利！**\n` : '';
    const text = `# ${title}\n## ランキング結果［第${turn}ターンで終了］\n${winnerTeam}` +
      ranking.map((p, i) => `> ${i+1}位:${p.team?`［${p.team}］`:''}${p.name}${p.status==='alive'?`［ライフ${p.hp}で生存］`:`［第${(p as any).turn}ターンで脱落］`}`).join('\n');
    copyToClipboard(text, setIsDiscordCopied);
  };
  const copyLogs = () => {
    copyToClipboard(logs.map(l => `T${l.turn}: ${l.message}`).join('\n'), setIsLogsCopied);
  };

  const isHealTurn = turn % healInterval === 0 && !reviveEvents.some(r => r.turn === turn);
  const currentReviveEvent = reviveEvents.find(r => r.turn === turn);
  const isReviveTurn = !!currentReviveEvent;

  const getPlayerWeights = (alive: Player[]) => {
    if (!isHpBalanceEnabled) return alive.map(p => ({ ...p, weight: 1 }));
    const total = alive.reduce((s, p) => s + p.hp, 0);
    const avg = total / alive.length;
    return alive.map(p => ({ ...p, weight: p.hp / avg }));
  };
  const selectWeightedPlayer = (wp: (Player & { weight: number })[]) => {
    const total = wp.reduce((s, p) => s + p.weight, 0);
    let r = Math.random() * total;
    for (const p of wp) { r -= p.weight; if (r <= 0) return p; }
    return wp[wp.length - 1];
  };

  const updateDisplayResultMulti = async (res: DisplayResult) => {
    setDisplayResult(res);
    if (isMultiplayer && myUid === roomHostId && currentRoomId) {
      try {
        await API.patchRoom(currentRoomId, { 'gameState.displayResult': res });
      } catch {}
    }
  };

  const togglePlayerSelection = (id: string) =>
    setSelectedPlayerIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // ===== メインスピン =====
  const spinRoulette = async () => {
    if (isSpinning) return;
    if (isMultiplayer && myUid !== roomHostId) return;

    const alivePlayers = players.filter(p => p.status === 'alive');
    const deadPlayers  = players.filter(p => p.status === 'dead');
    const isGameOver = mode === 'team'
      ? new Set(alivePlayers.map(p => p.team)).size <= 1
      : alivePlayers.length <= 1;

    if (isGameOver && !isReviveTurn) {
      if (isMultiplayer && currentRoomId) {
        await API.patchRoom(currentRoomId, { status: 'result' }).catch(() => {});
      } else { setPhase('result'); }
      return;
    }

    setIsSpinning(true);
    if (isMultiplayer && currentRoomId) {
      await API.patchRoom(currentRoomId, { 'gameState.isSpinning': true }).catch(() => {});
    }

    let effectType = isReviveTurn ? 'revive' : (isHealTurn ? 'heal' : 'damage');

    // ===== 特別イベント判定（スピン開始時にローカルで確定） =====
    let isReverse = false, isMulti = false, isFeint = false;
    let isInstantDeath = false, isReverseHealDamage = false, isTrueRandom = false;
    let isDice = false, isNumberFmt = false;
    let localNumberFmt = 'default';
    let isBarrierGift = false; // 無敵バリアカード付与イベント（1枚）
    let isBarrierMegaGift = false; // 無敵バリアカード10枚付与イベント
    let roadEventData: JapanRoad | null = null; // 国道ダメージ/回復イベント

    const isSpecialActive = isSpecialEventEnabled
      && Math.random() < (specialEventProb / 100)
      && !isReviveTurn && !isManualTurn;

    if (isSpecialActive) {
      // ロジック系と表示系を分けて選択
      const logicPool: string[] = [];
      if (enabledSpecialEvents.includes('reverseMode'))       logicPool.push('reverse');
      if (enabledSpecialEvents.includes('multiMode'))         logicPool.push('multi');
      if (enabledSpecialEvents.includes('feint'))             logicPool.push('feint');
      if (enabledSpecialEvents.includes('diceMode'))          logicPool.push('dice');
      if (enabledSpecialEvents.includes('reverseHealDamage')) logicPool.push('reverseHealDamage');
      if (enabledSpecialEvents.includes('instantDeath'))      logicPool.push('instantDeath');
      if (enabledSpecialEvents.includes('trueRandom'))        logicPool.push('trueRandom');
      if (enabledSpecialEvents.includes('numberFormat') && enabledFormats.length > 0) logicPool.push('numberFormat');
      if (isBarrierEventEnabled)                              logicPool.push('barrierGift');
      if (isBarrierEventEnabled && Math.random() < 0.10)      logicPool.push('barrierMegaGift');
      if (isRoadEventEnabled)                                 logicPool.push('roadEvent');

      // 重複発動モード：確率を満たすごとに最大3個まで選択（互いに競合しない組み合わせ）
      const applyEvent = (choice: string) => {
        if (choice === 'reverse')          { isReverse = true; }
        else if (choice === 'multi')       { isMulti = true; }
        else if (choice === 'feint')       { isFeint = true; }
        else if (choice === 'dice')        { isDice = true; }
        else if (choice === 'reverseHealDamage' && !isInstantDeath) { isReverseHealDamage = true; effectType = effectType === 'heal' ? 'damage' : 'heal'; }
        else if (choice === 'instantDeath')      { isInstantDeath = true; effectType = 'damage'; }
        else if (choice === 'trueRandom')        { isTrueRandom = true; }
        else if (choice === 'numberFormat') {
          isNumberFmt = true;
          localNumberFmt = enabledFormats[Math.floor(Math.random() * enabledFormats.length)];
        }
        else if (choice === 'barrierGift') { isBarrierGift = true; }
        else if (choice === 'barrierMegaGift') { isBarrierMegaGift = true; }
        else if (choice === 'roadEvent') {
          roadEventData = JAPAN_ROADS[Math.floor(Math.random() * JAPAN_ROADS.length)];
        }
      };

      if (logicPool.length > 0) {
        const usedChoices = new Set<string>();
        // 1回目（必ず選択）
        const choice1 = logicPool[Math.floor(Math.random() * logicPool.length)];
        applyEvent(choice1); usedChoices.add(choice1);

        // 重複発動モードON時：追加で最大2回チャンス（それぞれ発生確率で判定）
        if (isSpecialMultiEnabled) {
          const remaining = logicPool.filter(e => !usedChoices.has(e));
          if (remaining.length > 0 && Math.random() < (specialMultiProb / 100)) {
            const choice2 = remaining[Math.floor(Math.random() * remaining.length)];
            applyEvent(choice2); usedChoices.add(choice2);
            const remaining2 = remaining.filter(e => !usedChoices.has(e));
            if (remaining2.length > 0 && Math.random() < (specialMultiProb / 100)) {
              applyEvent(remaining2[Math.floor(Math.random() * remaining2.length)]);
            }
          }
        }
      }
    }

    // 表示バッジ用stateを更新
    setActiveNumberFormat(localNumberFmt);

    const weightedPlayers = getPlayerWeights(alivePlayers);
    if (isTrueRandom) weightedPlayers.forEach(p => (p as any).weight = 1);

    // ダイス値を事前生成（スピン中に固定表示するため）
    const diceResult = isDice ? generateDiceAmount() : null;

    const intervalMs = 60;
    const maxSpins = Math.max(10, Math.floor((spinDuration * 1000) / intervalMs));
    let spins = 0;

    const spinInterval = setInterval(() => {
      const randomAlive = selectWeightedPlayer(weightedPlayers);
      const nameDisp = randomAlive.name;

      if (isManualTurn && !isReviveTurn) {
        setDisplayResult({ player: '対象を選択してください', amount: String(convertNumber(generateAmount(), localNumberFmt)) });
      } else if (isReviveTurn && currentReviveEvent?.type === 'steal') {
        setDisplayResult({ player: `奪う対象: ${randomAlive.name}`, amount: '50%' });
      } else if (isReviveTurn && currentReviveEvent?.type === 'copy') {
        setDisplayResult({ player: `コピー元: ${randomAlive.name}`, amount: 'COPY' });
      } else if (isInstantDeath) {
        setDisplayResult({ player: `【即死】${nameDisp}`, amount: 'DEATH' });
      } else if (isBarrierGift || isBarrierMegaGift) {
        const amount = isBarrierMegaGift ? 'BARRIER+10' : 'BARRIER+1';
        setDisplayResult({ player: `🛡️ ${nameDisp}`, amount });
      } else if (roadEventData) {
        setDisplayResult({ player: `🛣️ 国道${roadEventData.no}号`, amount: `${roadEventData.from}→${roadEventData.to}` });
      } else if (isDice && diceResult) {
        const prefix = isReverse ? '【以外】' : (isMulti ? '【複数】' : '');
        // スピン中はランダムなダイス値をアニメーション表示
        const spinRolls = Array.from({ length: diceResult.rolls.length }, () =>
          Math.floor(Math.random() * (diceConfig.faceMax - diceConfig.faceMin + 1)) + diceConfig.faceMin
        );
        setDisplayResult({ player: `${prefix}${nameDisp}`, amount: formatDiceDisplay(spinRolls, localNumberFmt, diceResult.faceMax) });
      } else {
        const prefix = isReverse ? '【以外】' : (isMulti ? '【複数】' : '');
        setDisplayResult({ player: `${prefix}${nameDisp}`, amount: String(convertNumber(generateAmount(), localNumberFmt)) });
      }

      spins++;
      if (spins >= maxSpins) {
        clearInterval(spinInterval);
        if (isManualTurn && !isReviveTurn) {
          finalizeSpinManual(effectType, localNumberFmt);
        } else {
          finalizeSpin(
            effectType, alivePlayers, deadPlayers,
            isReverse, isMulti, weightedPlayers,
            isFeint, isInstantDeath, isReverseHealDamage,
            isDice, diceResult,
            localNumberFmt, isBarrierGift, isBarrierMegaGift,
            roadEventData
          );
        }
      }
    }, intervalMs);
  };

  const finalizeSpinManual = (effectType: string, fmt: string) => {
    const finalAmount = generateAmount();
    setDisplayResult({ player: '対象を選択してください', amount: String(convertNumber(finalAmount, fmt)) });
    setLastResult({ player: '手動選択', amount: finalAmount, targetIds: [], type: effectType });
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
    isReverseHealDamage: boolean,
    isDice: boolean,
    diceResult: { rolls: number[]; total: number; faceMax: number } | null,
    fmt: string,
    isBarrierGift: boolean = false,
    isBarrierMegaGift: boolean = false,
    roadEventData: JapanRoad | null = null
  ) => {
    let chosenPlayer = selectWeightedPlayer(weightedPlayers);
    let reviveTarget: Player | undefined;
    let finalAmount: number | string = 0;
    let updatedPlayers = [...players];
    let customLogData: Partial<LogEntry> | null = null;
    let targetIds: string[] = [];

    // ===== 無敵バリアカード付与イベント =====
    if (isBarrierGift) {
      updatedPlayers = updatedPlayers.map(p =>
        p.id === chosenPlayer.id ? { ...p, barriers: (p.barriers || 0) + 1 } : p
      );
      await updateDisplayResultMulti({ player: `🛡️ ${chosenPlayer.name}`, amount: 'BARRIER+1' });
      customLogData = { type: 'system', message: `${chosenPlayer.name}が無敵バリアカードを入手！(${(chosenPlayer.barriers||0)+1}枚)`, target: chosenPlayer.name, amount: 'BARRIER+1' };
      targetIds = [chosenPlayer.id];
      finalAmount = 0;
      if (isMultiplayer && currentRoomId) {
        try {
          await API.patchRoom(currentRoomId, {
            players: updatedPlayers,
            'gameState.turn': turn + 1,
            'gameState.logs': [{ id: Date.now(), turn, type: 'system', message: customLogData.message, target: chosenPlayer.name, amount: 'BARRIER+1' }, ...logs].slice(0, 100),
            'gameState.eliminated': eliminated,
            'gameState.isSpinning': false,
            'gameState.displayResult': { player: `🛡️ ${chosenPlayer.name}`, amount: 'BARRIER+1' },
            'gameState.lastResult': { player: chosenPlayer.name, targetIds, amount: 'BARRIER+1', type: 'barrier', isReverse: false, isMulti: false },
          });
          setIsSpinning(false);
        } catch { setIsSpinning(false); }
      } else {
        setPlayers(updatedPlayers);
        setLastResult({ player: chosenPlayer.name, targetIds, amount: 'BARRIER+1', type: 'barrier', isReverse: false, isMulti: false });
        setLogs(prev => [{ id: Date.now(), turn, type: 'system', message: customLogData!.message||'', target: chosenPlayer.name, amount: 'BARRIER+1' }, ...prev]);
        setTimeout(() => { setIsSpinning(false); setTurn(t => t + 1); }, 1500);
      }
      return;
    }

    // ===== 無敵バリアカード10枚付与イベント（フェードアウト→演出→フェードイン） =====
    if (isBarrierMegaGift) {
      updatedPlayers = updatedPlayers.map(p =>
        p.id === chosenPlayer.id ? { ...p, barriers: (p.barriers || 0) + 10 } : p
      );
      customLogData = { type: 'system', message: `✨ ${chosenPlayer.name}が無敵バリアカードを10枚入手！(${(chosenPlayer.barriers||0)+10}枚)`, target: chosenPlayer.name, amount: 'BARRIER+10' };
      targetIds = [chosenPlayer.id];
      // フェードアウト演出開始
      setBarrierMegaTarget(chosenPlayer.name);
      setBarrierMegaAnimPhase('fadeout');
      await new Promise(r => setTimeout(r, 500));
      // 結果表示（アニメーション込みで3秒表示）
      setBarrierMegaAnimPhase('result');
      await updateDisplayResultMulti({ player: `✨🛡️ ${chosenPlayer.name}`, amount: 'BARRIER+10' });
      await new Promise(r => setTimeout(r, 3200));
      // フェードイン
      setBarrierMegaAnimPhase('fadein');
      await new Promise(r => setTimeout(r, 500));
      setBarrierMegaAnimPhase(null);

      if (isMultiplayer && currentRoomId) {
        try {
          await API.patchRoom(currentRoomId, {
            players: updatedPlayers,
            'gameState.turn': turn + 1,
            'gameState.logs': [{ id: Date.now(), turn, type: 'system', message: customLogData.message, target: chosenPlayer.name, amount: 'BARRIER+10' }, ...logs].slice(0, 100),
            'gameState.eliminated': eliminated,
            'gameState.isSpinning': false,
            'gameState.displayResult': { player: `✨🛡️ ${chosenPlayer.name}`, amount: 'BARRIER+10' },
            'gameState.lastResult': { player: chosenPlayer.name, targetIds, amount: 'BARRIER+10', type: 'barrier', isReverse: false, isMulti: false },
          });
          setIsSpinning(false);
        } catch { setIsSpinning(false); }
      } else {
        setPlayers(updatedPlayers);
        setLastResult({ player: chosenPlayer.name, targetIds, amount: 'BARRIER+10', type: 'barrier', isReverse: false, isMulti: false });
        setLogs(prev => [{ id: Date.now(), turn, type: 'system', message: customLogData!.message||'', target: chosenPlayer.name, amount: 'BARRIER+10' }, ...prev]);
        setTimeout(() => { setIsSpinning(false); setTurn(t => t + 1); }, 1500);
      }
      return;
    }

    // ===== 国道ダメージ/回復イベント =====
    if (roadEventData) {
      const roadAmount = roadEventData.no; // 国道番号がダメージ/回復量
      finalAmount = roadAmount;
      targetIds = [chosenPlayer.id];
      const logType = effectType === 'heal' ? 'heal' : 'damage';
      const roadLabel = `国道${roadEventData.no}号（${roadEventData.from}→${roadEventData.to}）`;
      if (effectType === 'heal') {
        updatedPlayers = updatedPlayers.map(p =>
          p.id === chosenPlayer.id ? { ...p, hp: p.hp + roadAmount } : p
        );
        customLogData = { type: logType, message: `🛣️ ${chosenPlayer.name}に${roadLabel}で${roadAmount}回復！`, target: chosenPlayer.name, amount: roadAmount };
      } else {
        const actualDmg = Math.min(roadAmount, chosenPlayer.hp);
        updatedPlayers = updatedPlayers.map(p =>
          p.id === chosenPlayer.id ? { ...p, hp: Math.max(0, p.hp - roadAmount) } : p
        );
        customLogData = { type: logType, message: `🛣️ ${chosenPlayer.name}に${roadLabel}で${actualDmg}ダメージ！`, target: chosenPlayer.name, amount: roadAmount };
      }
      const roadDisplayAmount = `${roadEventData.from}→${roadEventData.to}`;
      setDisplayResult({ player: `🛣️ 国道${roadEventData.no}号 → ${chosenPlayer.name}`, amount: roadDisplayAmount });
      setAnimatingPlayerIds([chosenPlayer.id]);
      setAnimatingType(effectType === 'heal' ? 'heal' : 'damage');
      await new Promise(r => setTimeout(r, 800));
      setAnimatingPlayerIds([]); setAnimatingType(null);

      // 脱落チェック
      const eliminated2 = [...eliminated];
      updatedPlayers = updatedPlayers.map(p => {
        if (p.id === chosenPlayer.id && p.status === 'alive' && p.hp <= 0 && (p.barriers || 0) <= 0) {
          eliminated2.push({ name: p.name, turn });
          return { ...p, status: 'dead' as const, hp: 0 };
        }
        return p;
      });

      if (isMultiplayer && currentRoomId) {
        try {
          await API.patchRoom(currentRoomId, {
            players: updatedPlayers,
            'gameState.turn': turn + 1,
            'gameState.logs': [{ id: Date.now(), turn, type: logType, message: customLogData.message, target: chosenPlayer.name, amount: roadAmount }, ...logs].slice(0, 100),
            'gameState.eliminated': eliminated2,
            'gameState.isSpinning': false,
            'gameState.displayResult': { player: `🛣️ 国道${roadEventData.no}号 → ${chosenPlayer.name}`, amount: roadDisplayAmount },
            'gameState.lastResult': { player: chosenPlayer.name, targetIds, amount: roadAmount, type: logType, isReverse: false, isMulti: false },
          });
          setIsSpinning(false);
        } catch { setIsSpinning(false); }
      } else {
        setPlayers(updatedPlayers);
        setEliminated(eliminated2);
        setLastResult({ player: chosenPlayer.name, targetIds, amount: roadAmount, type: logType, isReverse: false, isMulti: false });
        setLogs(prev => [{ id: Date.now(), turn, type: logType, message: customLogData!.message||'', target: chosenPlayer.name, amount: roadAmount }, ...prev]);
        setTimeout(() => { setIsSpinning(false); setTurn(t => t + 1); }, 1500);
      }
      return;
    }

    // フェイント
    if (isFeint) {
      const fakePlayer = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      const fakeAmount = generateAmount();
      await updateDisplayResultMulti({ player: `【！？】${fakePlayer.name}`, amount: String(convertNumber(fakeAmount, fmt)) });
      setAnimatingPlayerIds([fakePlayer.id]); setAnimatingType(effectType);
      await new Promise(r => setTimeout(r, 1200));
    }

    const displayPlayerName = chosenPlayer.name;

    if (effectType === 'revive') {
      if (deadPlayers.length === 0) {
        await updateDisplayResultMulti({ player: '脱落者なし', amount: 'SKIP' });
        customLogData = { type: 'system', message: '復活対象なし、スキップ', target: 'なし' };
      } else {
        if (currentReviveEvent?.type === 'steal') {
          const lastElim = [...eliminated].reverse()[0];
          reviveTarget = players.find(p => p.name === lastElim.name);
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
          await updateDisplayResultMulti({ player: `${reviveTarget.name} 復活！`, amount: String(convertNumber(finalAmount as number, fmt)) });
          targetIds = [reviveTarget.id];
          setEliminated(prev => prev.filter(e => e.name !== reviveTarget!.name));
        }
      }
    } else if (isInstantDeath) {
      targetIds = [chosenPlayer.id];
      if ((chosenPlayer.barriers||0) > 0) {
        // バリアで即死を防ぐ
        updatedPlayers = updatedPlayers.map(p => p.id === chosenPlayer.id ? { ...p, barriers: (p.barriers||1) - 1 } : p);
        await updateDisplayResultMulti({ player: `🛡️ ${displayPlayerName}`, amount: 'BLOCK!' });
        customLogData = { type: 'system', message: `${chosenPlayer.name}がバリアで即死をブロック！(残${(chosenPlayer.barriers||1)-1}枚)`, amount: 'BLOCK!', target: chosenPlayer.name };
        finalAmount = 0;
      } else {
        updatedPlayers = updatedPlayers.map(p => targetIds.includes(p.id) ? { ...p, hp: 0 } : p);
        await updateDisplayResultMulti({ player: displayPlayerName, amount: 'DEATH' });
        customLogData = { type: 'damage', message: `【脱落イベント】${chosenPlayer.name}が即死！`, amount: 'DEATH', target: chosenPlayer.name };
        finalAmount = 'DEATH';
      }
    } else {
      // ===== ダイスルーレット =====
      let diceRolls: number[] | null = null;
      if (isDice && diceResult) {
        diceRolls = diceResult.rolls;
        finalAmount = diceResult.total;
      } else {
        finalAmount = generateAmount();
      }

      const revMsg = isReverseHealDamage ? '(効果反転)' : '';
      const amountForDisplay = diceRolls
        ? formatDiceDisplay(diceRolls, fmt, diceResult?.faceMax)
        : String(convertNumber(finalAmount as number, fmt));
      // ログ用は合計値のみ
      const amountForLog = finalAmount as number;

      if (isReverse) {
        // リバース：バリア持ちはバリア消費でダメージ無効
        targetIds = alivePlayers.filter(p => p.id !== chosenPlayer.id).map(p => p.id);
        const barrierBlockedNames: string[] = [];
        updatedPlayers = updatedPlayers.map(p => {
          if (!targetIds.includes(p.id)) return p;
          if (effectType === 'damage' && (p.barriers||0) > 0) {
            barrierBlockedNames.push(p.name);
            return { ...p, barriers: (p.barriers||1) - 1 };
          }
          return { ...p, hp: Math.max(0, effectType === 'heal' ? p.hp + amountForLog : p.hp - amountForLog) };
        });
        await updateDisplayResultMulti({ player: `【以外】${displayPlayerName}`, amount: amountForDisplay });
        targetIds = ['SPECIAL'];
        const barrierNote = barrierBlockedNames.length > 0 ? ` (🛡️${barrierBlockedNames.join(',')}ガード)` : '';
        customLogData = { type: effectType, message: `${chosenPlayer.name}「以外」全員に${amountForLog}${effectType==='heal'?'回復':'ダメージ'}${revMsg}${barrierNote}`, amount: amountForLog, target: '複数名' };
      } else if (isMulti) {
        const count = Math.max(2, Math.floor(Math.random() * alivePlayers.length) + 1);
        const selected = [...alivePlayers].sort(() => 0.5 - Math.random()).slice(0, count);
        await updateDisplayResultMulti({ player: `【マルチ発動】${selected.length}名`, amount: amountForDisplay });
        await new Promise(r => setTimeout(r, 800));
        targetIds = [];
        for (const target of selected) {
          targetIds.push(target.id);
          const tName = target.name;
          await updateDisplayResultMulti({ player: `${tName}に${amountForDisplay}${effectType==='heal'?'回復':'ダメージ'}`, amount: amountForDisplay });
          await new Promise(r => setTimeout(r, 800));
        }
        const barrierBlockedNamesM: string[] = [];
        updatedPlayers = updatedPlayers.map(p => {
          if (!targetIds.includes(p.id)) return p;
          if (effectType === 'damage' && (p.barriers||0) > 0) {
            barrierBlockedNamesM.push(p.name);
            return { ...p, barriers: (p.barriers||1) - 1 };
          }
          return { ...p, hp: Math.max(0, effectType === 'heal' ? p.hp + amountForLog : p.hp - amountForLog) };
        });
        await updateDisplayResultMulti({ player: `【複数】${selected.length}名`, amount: amountForDisplay });
        targetIds = ['SPECIAL'];
        const barrierNoteM = barrierBlockedNamesM.length > 0 ? ` (🛡️${barrierBlockedNamesM.join(',')}ガード)` : '';
        customLogData = { type: effectType, message: `ランダムに選ばれた${selected.length}名に${amountForLog}${effectType==='heal'?'回復':'ダメージ'}${revMsg}${barrierNoteM}`, amount: amountForLog, target: `${selected.length}名` };
      } else {
        targetIds = [chosenPlayer.id];
        // バリアカード：ダメージを無効化してバリアを1枚消費
        if (effectType === 'damage' && (chosenPlayer.barriers||0) > 0) {
          updatedPlayers = updatedPlayers.map(p => p.id === chosenPlayer.id ? { ...p, barriers: (p.barriers||1) - 1 } : p);
          await updateDisplayResultMulti({ player: `🛡️ ${displayPlayerName}`, amount: 'BLOCK!' });
          customLogData = { type: 'system', message: `${chosenPlayer.name}がバリアでダメージをブロック！(残${(chosenPlayer.barriers||1)-1}枚)`, amount: 'BLOCK!', target: chosenPlayer.name };
        } else {
          updatedPlayers = updatedPlayers.map(p => p.id === chosenPlayer.id
            ? { ...p, hp: Math.max(0, effectType === 'heal' ? p.hp + amountForLog : p.hp - amountForLog) } : p);
          await updateDisplayResultMulti({ player: displayPlayerName, amount: amountForDisplay });
          customLogData = { type: effectType, message: `${chosenPlayer.name}に${amountForLog}${effectType==='heal'?'回復':'ダメージ'}${revMsg}`, amount: amountForLog, target: chosenPlayer.name };
        }
      }
      finalAmount = amountForLog;
    }

    const newlyDead: EliminatedPlayer[] = [];
    updatedPlayers = updatedPlayers.map(p => {
      if (p.status === 'alive' && p.hp <= 0) { newlyDead.push({ name: p.name, turn }); return { ...p, hp: 0, status: 'dead' as const }; }
      return p;
    });

    const turnLogs: LogEntry[] = [];
    if (customLogData) turnLogs.push({ id: Date.now(), turn, type: customLogData.type||'system', message: customLogData.message||'', amount: customLogData.amount, target: customLogData.target });
    newlyDead.forEach((d, i) => turnLogs.push({ id: Date.now()+i+1, turn, type: 'death', message: `${d.name}が脱落...`, target: d.name }));

    if (isMultiplayer && currentRoomId) {
      try {
        const afterAlive = updatedPlayers.filter(p => p.status === 'alive');
        const isFinished = mode === 'team' ? new Set(afterAlive.map(p => p.team)).size <= 1 : afterAlive.length <= 1;
        // アニメーション開始（シングルと同じタイミング）
        setAnimatingPlayerIds(targetIds);
        setAnimatingType(effectType);
        setTimeout(() => { setAnimatingPlayerIds([]); setAnimatingType(null); }, 2000);
        await API.patchRoom(currentRoomId, {
          players: updatedPlayers,
          'gameState.turn': isFinished ? turn : turn + 1,
          'gameState.logs': [...turnLogs, ...logs].slice(0, 100),
          'gameState.eliminated': [...eliminated, ...newlyDead],
          'gameState.isSpinning': false,
          'gameState.displayResult': { player: displayPlayerName, amount: String(convertNumber(finalAmount as number, fmt)) },
          'gameState.lastResult': { player: chosenPlayer.name, targetIds, amount: finalAmount, type: effectType, isReverse, isMulti },
          ...(isFinished ? { status: 'result' } : {})
        });
        // シングルと同じ1500ms後に後処理
        setTimeout(() => {
          setIsSpinning(false);
        }, 1500);
      } catch { setIsSpinning(false); }
    } else {
      setPlayers(updatedPlayers);
      if (newlyDead.length > 0) setEliminated(prev => [...prev, ...newlyDead]);
      setLastResult({ player: chosenPlayer.name, targetIds, amount: finalAmount, type: effectType, isReverse, isMulti });
      setLogs(prev => [...turnLogs, ...prev]);
        setTimeout(() => {
          setIsSpinning(false);
          const afterAlive = updatedPlayers.filter(p => p.status === 'alive');
          const isFinished = mode === 'team' ? new Set(afterAlive.map(p => p.team)).size <= 1 : afterAlive.length <= 1;
          if (isFinished) {
            setPhase('result');
          } else {
            setTurn(t => t + 1);
          }
        }, 1500);
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
      turnLogs.push({ id: Date.now(), turn, type: effectType, message: `【手動選択】${targetNames.join(', ')}に${finalAmount}${effectType==='heal'?'回復':'ダメージ'}`, amount: finalAmount, target: targetNames.join(', ') });
      if (newlyDead.length > 0) {
        setEliminated(prev => [...prev, ...newlyDead]);
        newlyDead.forEach((d, i) => turnLogs.push({ id: Date.now()+i+1, turn, type: 'death', message: `${d.name}が脱落...`, target: d.name }));
      }
    } else {
      turnLogs.push({ id: Date.now(), turn, type: 'system', message: `対象なし（${finalAmount}${effectType==='heal'?'回復':'ダメージ'} スキップ）`, target: 'なし' });
    }
    setLogs(prev => [...turnLogs, ...prev]);
    setIsManualSelectionPhase(false); setSelectedPlayerIds([]);
    const afterAlive = updatedPlayers.filter(p => p.status === 'alive');
    const isFinished = mode === 'team' ? new Set(afterAlive.map(p => p.team)).size <= 1 : afterAlive.length <= 1;
    if (isFinished) setPhase('result'); else setTurn(t => t + 1);
  };

  const getCombinedRanking = () => {
    const alive = players.filter(p => p.status === 'alive').sort((a, b) => b.hp - a.hp);
    // eliminatedはname基準で最後に脱落したエントリのみ残す（復活→再脱落で重複を防ぐ）
    // 現在deadのプレイヤーだけを対象にする（復活して生存中の人はalive側に入る）
    const deadPlayerIds = new Set(players.filter(p => p.status === 'dead').map(p => p.id));
    // eliminatedを逆順にして、各プレイヤーの最後の脱落記録のみ取得
    const seenNames = new Set<string>();
    const latestEliminated: EliminatedPlayer[] = [];
    for (const e of [...eliminated].reverse()) {
      if (!seenNames.has(e.name)) {
        seenNames.add(e.name);
        latestEliminated.push(e);
      }
    }
    // 現在deadのプレイヤーに絞ってdead配列を構築（生存復活者は除外）
    const dead = latestEliminated
      .filter(e => {
        const p = players.find(pl => pl.name === e.name);
        return p && deadPlayerIds.has(p.id);
      })
      .map(e => {
        const p = players.find(pl => pl.name === e.name);
        return { ...p!, status: 'dead' as const, turn: e.turn };
      });
    return [...alive, ...dead];
  };

  const backToHome = async () => {
    // マルチ中は退室処理をKVに反映
    if (isMultiplayer && currentRoomId) {
      try {
        const data = await API.getRoom(currentRoomId);
        if (data) {
          if (data.hostId === myUid) {
            // オーナーが抜ける → ルームをclosedに
            await API.patchRoom(currentRoomId, { status: 'closed' });
          } else {
            // 参加者が抜ける → playersから自分を除外
            const updated = (data.players || []).filter((p: Player) => p.uid !== myUid);
            await API.patchRoom(currentRoomId, { players: updated });
          }
        }
      } catch {}
    }
    setPhase('home'); setIsMultiplayer(false); setCurrentRoomId(null); setRoomHostId(null);
    setPlayers([]); setEliminated([]); setLogs([]); setTurn(1);
    setDisplayResult({ player: '？？？', amount: '？' }); setLastResult(null);
    setActiveNumberFormat('default'); setIsSpectatorMode(false);
  };

  // ===== 設定関連 =====
  const addFixedItem = () => {
    if (config.fixedItems.length >= 5) return;
    const newId = config.fixedItems.length > 0 ? Math.max(...config.fixedItems.map(i => i.id)) + 1 : 1;
    setConfig({ ...config, fixedItems: [...config.fixedItems, { id: newId, value: 500, prob: 0 }] });
  };
  const removeFixedItem = (id: number) => setConfig({ ...config, fixedItems: config.fixedItems.filter(i => i.id !== id) });
  const handleSpecialEventProbComplete = (e: React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) => {
    if (e.type === 'blur' || (e.type === 'keydown' && (e as React.KeyboardEvent).key === 'Enter'))
      setSpecialEventProb(Math.min(100, Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1)));
  };
  const handleConfigComplete = (e: React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>, field: keyof Config, min: number, max: number | null = null) => {
    if (e.type === 'blur' || (e.type === 'keydown' && (e as React.KeyboardEvent).key === 'Enter')) {
      let val = parseInt((e.target as HTMLInputElement).value);
      if (isNaN(val)) val = min;
      val = Math.max(min, val);
      if (max !== null) val = Math.min(max, val);
      setConfig(prev => ({ ...prev, [field]: val }));
    }
  };
  const updateFixedItemValue = (id: number, field: string, val: string) =>
    setConfig({ ...config, fixedItems: config.fixedItems.map(i => i.id === id ? { ...i, [field]: val } : i) });
  const handleFixedItemComplete = (e: React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>, id: number, field: string, min: number) => {
    if (e.type === 'blur' || (e.type === 'keydown' && (e as React.KeyboardEvent).key === 'Enter')) {
      let val = parseInt((e.target as HTMLInputElement).value);
      if (isNaN(val)) val = min; val = Math.max(min, val);
      setConfig(prev => ({ ...prev, fixedItems: prev.fixedItems.map(i => i.id === id ? { ...i, [field]: val } : i) }));
    }
  };
  const addReviveEvent = () => {
    if (reviveEvents.length >= 5) return;
    const newId = reviveEvents.length > 0 ? Math.max(...reviveEvents.map(r => r.id)) + 1 : 1;
    setReviveEvents([...reviveEvents, { id: newId, turn: 50, type: 'steal' }]);
    setReviveTurnInputs(prev => ({ ...prev, [newId]: '50' }));
  };
  const removeReviveEvent = (id: number) => setReviveEvents(reviveEvents.filter(r => r.id !== id));
  const updateReviveEventState = (id: number, field: string, val: string) =>
    setReviveEvents(reviveEvents.map(r => r.id === id ? { ...r, [field]: field === 'turn' ? (parseInt(val)||0) : val } as ReviveEvent : r));
  const autoAssignTeams = () => {
    if (isMultiplayer && myUid === roomHostId && currentRoomId) {
      const updated = [...players].map((p, i) => ({ ...p, teamIndex: i % teamCount, team: teamNames[i % teamCount] }));
      API.patchRoom(currentRoomId, { players: updated }).catch(() => {});
    } else if (!isMultiplayer) {
      setManualPlayers(prev => prev.map((p, i) => ({ ...p, teamIndex: i % teamCount })));
    }
  };
  const updatePlayerTeam = (name: string, teamIdx: string | number) =>
    setManualPlayers(prev => prev.map(p => p.name === name ? { ...p, teamIndex: parseInt(String(teamIdx)) } : p));
  const updateTeamName = (i: number, name: string) => {
    const u = [...teamNames]; u[i] = name; setTeamNames(u);
  };

  // ===== Multiplayer ルーム操作 =====
  const handleCreateRoom = async () => {
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    try {
      await API.createRoom({
        hostId: myUid, status: 'joining', roomId,
        settings: { title, mode, teamCount, teamNames, initialHP, spinDuration, healInterval,
          isHpBalanceEnabled, isSpecialEventEnabled, specialEventProb, enabledSpecialEvents,
          diceConfig, enabledFormats, config, reviveEvents,
          isBarrierEventEnabled, isRoadEventEnabled, isSpecialMultiEnabled, specialMultiProb },
        players: [],
        gameState: { turn: 1, logs: [], eliminated: [], isSpinning: false,
          displayResult: { player: '\uff1f\uff1f\uff1f', amount: '\uff1f' }, lastResult: null }
      });
      setCurrentRoomId(roomId); setRoomHostId(myUid); setPhase('multi_name');
    } catch (e) {
      console.error('Room creation failed', e);
      alert('\u30eb\u30fc\u30e0\u306e\u4f5c\u6210\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002');
    }
  };
  const handleJoinRoomFinal = async (overrideRoomId?: string, overrideName?: string) => {
    const roomIdToUse = (overrideRoomId ?? joinRoomIdInput).trim().toUpperCase();
    const nameToUse = (overrideName ?? playerNameInput).trim();
    if (!roomIdToUse || !nameToUse) return;
    try {
      const rd = await API.getRoom(roomIdToUse);
      if (!rd) { setJoinError('\u30eb\u30fc\u30e0ID\u300c' + roomIdToUse + '\u300d\u306f\u5b58\u5728\u3057\u307e\u305b\u3093\u3002'); return; }
      if (rd.status !== 'joining') { setJoinError('\u3053\u306e\u30eb\u30fc\u30e0\u306f\u3059\u3067\u306b\u30b2\u30fc\u30e0\u5f53\u4e2d\u307e\u305f\u306f\u7d42\u4e86\u3057\u3066\u3044\u307e\u3059\u3002'); return; }
      setCurrentRoomId(roomIdToUse);
      syncSettingsFromRoom(rd.settings);
      if (!rd.players.find((p: Player) => p.uid === myUid)) {
        const ti = rd.settings.mode === 'team' ? (rd.players.length % rd.settings.teamCount) : 0;
        await API.patchRoom(roomIdToUse, { players: [...rd.players, {
          id: `p-${Date.now()}-${myUid}`, uid: myUid,
          name: nameToUse, hp: rd.settings.initialHP,
          status: 'alive', teamIndex: ti,
          team: rd.settings.mode === 'team' ? (rd.settings.teamNames[ti] || `\u30c1\u30fc\u30e0${String.fromCharCode(65+ti)}`) : null
        }] });
      }
      setJoinError(''); setIsMultiplayer(true); setPhase('multi_lobby');
    } catch (e: any) {
      setJoinError('\u5165\u5c4e\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002(\u30a8\u30e9\u30fc: ' + (e?.message || 'unknown') + ')');
    }
  };


  const startGameSingle = () => {
    if (totalProb !== 100 || manualPlayers.length < 2) return;
    const colors = ['text-red-400','text-blue-400','text-emerald-400','text-amber-400','text-purple-400','text-cyan-400'];
    setPlayers(manualPlayers.map((p, i) => ({
      id: `p-${Date.now()}-${i}`, name: p.name, hp: initialHP, status: 'alive',
      team: mode === 'team' ? (teamNames[p.teamIndex] || `チーム${String.fromCharCode(65+p.teamIndex)}`) : null,
      teamColor: mode === 'team' ? colors[p.teamIndex % colors.length] : null,
      teamIndex: p.teamIndex
    })));
    setPhase('playing'); setTurn(1); setEliminated([]); setLogs([]); setLastResult(null);
    setActiveNumberFormat('default');
    setIsManualSelectionPhase(false); setSelectedPlayerIds([]);
  };

  const startMultiplayerGame = async () => {
    if (!currentRoomId) return;
    const colors = ['text-red-400','text-blue-400','text-emerald-400','text-amber-400','text-purple-400','text-cyan-400'];
    try {
      await API.patchRoom(currentRoomId, {
        status: 'playing',
        players: players.map(p => ({ ...p, teamColor: mode === 'team' ? colors[(p.teamIndex||0) % colors.length] : null })),
        'gameState.turn': 1, 'gameState.logs': [], 'gameState.eliminated': [], 'gameState.lastResult': null
      });
    } catch (e) { console.error('startMultiplayerGame failed', e); }
  };

  // ===== Drag & Drop =====
  const onDragStart = (e: React.DragEvent, p: Player | ManualPlayer) => { setDraggedPlayer(p); e.dataTransfer.setData('playerName', p.name); };
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (e: React.DragEvent, ti: number) => { e.preventDefault(); if (draggedPlayer && !isMultiplayer) { updatePlayerTeam(draggedPlayer.name, ti); setDraggedPlayer(null); } };
  const onDropLobby = async (e: React.DragEvent, ti: number) => {
    e.preventDefault();
    if (draggedPlayer && isMultiplayer && myUid === roomHostId && currentRoomId) {
      try {
        await API.patchRoom(currentRoomId, {
          players: players.map(p => (p as Player).id === (draggedPlayer as Player).id ? { ...p, teamIndex: ti, team: teamNames[ti] } : p)
        });
      } catch {}
      setDraggedPlayer(null);
    }
  };
  const onTouchStart = (_: React.TouchEvent, p: Player | ManualPlayer) => setDraggedPlayer(p);
  const onTouchMove = (e: React.TouchEvent) => {
    if (!draggedPlayer) return;
    const t = e.touches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY)?.closest('[data-team-index]');
    setTouchTargetTeam(el ? parseInt(el.getAttribute('data-team-index') || '0') : null);
  };
  const onTouchEnd = () => { if (draggedPlayer && touchTargetTeam !== null && !isMultiplayer) updatePlayerTeam(draggedPlayer.name, touchTargetTeam); setDraggedPlayer(null); setTouchTargetTeam(null); };
  const onTouchEndLobby = async () => {
    if (draggedPlayer && touchTargetTeam !== null && isMultiplayer && myUid === roomHostId && currentRoomId) {
      try {
        await API.patchRoom(currentRoomId, {
          players: players.map(p => (p as Player).id === (draggedPlayer as Player).id ? { ...p, teamIndex: touchTargetTeam, team: teamNames[touchTargetTeam] } : p)
        });
      } catch {}
    }
    setDraggedPlayer(null); setTouchTargetTeam(null);
  };

  // ===== RankingList コンポーネント =====
  const RankingList = ({ ranking }: { ranking: any[] }) => (
    <div className="space-y-2 overflow-y-auto flex-1 pr-1 custom-scrollbar">
      {ranking.map((p, i) => {
        const alive = p.status === 'alive';
        const first = i === 0 && alive;
        const lowHp = alive && p.hp <= initialHP * 0.3;
        return (
          <div key={i} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${first ? 'bg-indigo-600/30 border-indigo-400 shadow-[0_0_25px_rgba(99,102,241,0.4)] scale-[1.02]' : alive ? (lowHp ? 'bg-red-950/20 border-red-800 animate-pulse' : 'bg-slate-900 border-slate-700') : 'bg-slate-950/60 border-slate-900 opacity-60'}`}>
            <div className="flex items-center gap-4 overflow-hidden">
              <span className={`font-black text-lg w-8 shrink-0 ${first ? 'text-amber-400' : 'text-slate-500'}`}>{i+1}</span>
              <span className={`font-bold text-base truncate ${alive ? (p.teamColor || 'text-white') : 'text-slate-400'}`}>{p.team ? `[${p.team}] ` : ''}{p.name}</span>
            </div>
            <div className="text-right shrink-0 ml-4 flex items-center gap-2">
              {lowHp && <span className="text-red-500 animate-bounce"><ShieldAlert size={14}/></span>}
              {alive
                ? <span className={`font-black text-sm px-3 py-1.5 rounded-xl border tabular-nums ${lowHp ? 'bg-red-500/20 text-red-500 border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>HP {p.hp}</span>
                : <span className="text-slate-500 font-bold text-xs px-3 py-1.5 bg-slate-800/40 rounded-xl border border-slate-800/50">T{p.turn}脱落</span>}
            </div>
          </div>
        );
      })}
    </div>
  );

  // ========== RENDER: home ==========
  if (phase === 'home') return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"/>
      <div className="z-10 text-center max-w-xl w-full">
        <div className="mb-4 inline-block p-4 bg-indigo-900/50 rounded-3xl border border-indigo-500/30"><Swords size={48} className="text-indigo-400"/></div>
        <h1 className="text-5xl md:text-7xl font-black italic tracking-tighter text-white drop-shadow-2xl mb-12 uppercase leading-none">Survival<br/><span className="text-indigo-400">Roulette</span></h1>
        <div className="flex flex-col gap-4">
          <button onClick={() => { setIsMultiplayer(false); setPhase('setup'); }} className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-2xl transition-all shadow-[0_0_30px_rgba(79,70,229,0.4)] flex items-center justify-center gap-3"><Users size={24}/> ひとりで遊ぶ</button>
          <button onClick={() => setPhase('multi_menu')} className="w-full py-5 bg-slate-900 border-2 border-slate-700 hover:border-indigo-500 hover:bg-slate-800 text-slate-300 hover:text-white rounded-2xl font-black text-2xl transition-all flex items-center justify-center gap-3"><Activity size={24}/> みんなで遊ぶ</button>
        </div>
      </div>
    </div>
  );

  if (phase === 'multi_menu') return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900 rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl flex flex-col items-center text-center">
        <h2 className="text-3xl font-black italic tracking-tighter text-indigo-400 mb-2 uppercase">Multiplayer</h2>

        {/* オンライン同期バッジ */}
        <div className="w-full bg-emerald-900/30 border border-emerald-500/30 rounded-2xl px-4 py-2 mb-6 flex items-center gap-2">
          <span className="text-emerald-400 text-xs animate-pulse">●</span>
          <span className="text-emerald-300 text-xs font-bold">オンライン同期: 接続済み</span>
        </div>

        <div className="flex flex-col gap-4 w-full">
          <button onClick={() => { setIsMultiplayer(true); setPhase('setup'); }} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xl transition-all">マルチプレイルーム作成</button>
          <button onClick={() => { setIsMultiplayer(true); setPhase('multi_join_id'); }} className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black text-xl transition-all">ID入室</button>
        </div>
        <button onClick={() => setPhase('home')} className="mt-8 text-slate-500 font-bold hover:text-white transition-colors">← 戻る</button>
      </div>
    </div>
  );


  if (phase === 'multi_join_id') return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900 rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl text-center">
        <h2 className="text-2xl font-black italic tracking-tighter text-white mb-2 uppercase">JOIN ROOM</h2>
        <p className="text-slate-400 text-xs font-bold mb-6">ルームIDと名前を入力して入室してください</p>
        <div className="space-y-4 mb-2">
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 text-left">ルームID</label>
            <input
              type="text"
              value={joinRoomIdInput}
              onChange={e => setJoinRoomIdInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
              placeholder="ROOM ID"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-4 font-black text-2xl outline-none focus:border-indigo-500 text-center uppercase tracking-widest text-indigo-400"
              maxLength={6}
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 text-left">プレイヤー名</label>
            <input
              type="text"
              value={playerNameInput}
              onChange={e => setPlayerNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && joinRoomIdInput.trim() && playerNameInput.trim()) handleJoinRoomFinal(); }}
              placeholder="名前を入力"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-4 font-bold text-lg outline-none focus:border-indigo-500 text-center text-white"
              maxLength={15}
            />
          </div>
        </div>
        {joinError && <div className="text-red-500 text-xs font-bold mb-4 mt-2">{joinError}</div>}
        <button
          onClick={() => handleJoinRoomFinal()}
          disabled={!joinRoomIdInput.trim() || !playerNameInput.trim()}
          className={`w-full mt-4 py-4 rounded-xl font-black text-xl transition-all ${joinRoomIdInput.trim() && playerNameInput.trim() ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500'}`}
        >入室する</button>
        <button onClick={() => setPhase('multi_menu')} className="mt-6 text-slate-500 font-bold hover:text-white transition-colors">キャンセル</button>
      </div>
    </div>
  );

  if (phase === 'multi_name') return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900 rounded-[2.5rem] border border-slate-800 p-8 shadow-2xl text-center">
        <h2 className="text-2xl font-black italic tracking-tighter text-white mb-2 uppercase">YOUR NAME</h2>
        <p className="text-slate-400 text-xs font-bold mb-6">ゲーム内で表示される名前を入力してください</p>
        <input
          type="text"
          value={playerNameInput}
          onChange={e => setPlayerNameInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && playerNameInput.trim()) handleJoinRoomFinal(currentRoomId ?? undefined, playerNameInput); }}
          placeholder="Player Name"
          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-4 font-bold text-lg mb-6 outline-none focus:border-indigo-500 text-center text-white"
          maxLength={15}
        />
        <button
          onClick={() => handleJoinRoomFinal(currentRoomId ?? undefined, playerNameInput)}
          disabled={!playerNameInput.trim()}
          className={`w-full py-4 rounded-xl font-black text-xl transition-all ${playerNameInput.trim() ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500'}`}
        >入室する</button>
      </div>
    </div>
  );

  if (phase === 'multi_lobby') {
    const isHost2 = myUid === roomHostId;
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 flex flex-col items-center justify-center">
        <div className="bg-slate-900 rounded-[3rem] shadow-2xl border border-slate-800 w-full max-w-4xl p-6 md:p-10 flex flex-col h-[85vh]">
          <div className="text-center mb-6 shrink-0 relative">
            <div className="absolute top-0 left-0 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1"><Activity size={12}/> MULTIPLAYER</div>
            <button onClick={backToHome} className="absolute top-0 right-0 text-slate-500 hover:text-white font-bold text-xs flex items-center gap-1 transition-colors"><RotateCcw size={12}/> 退室</button>
            <h2 className="text-4xl font-black italic tracking-tighter text-white mt-4 md:mt-0 mb-4 uppercase">WAITING LOBBY</h2>
            <div className="inline-flex items-center gap-4 bg-slate-950 border border-slate-800 px-6 py-3 rounded-2xl mx-auto">
              <span className="text-slate-500 font-black text-xs uppercase tracking-widest">Room ID</span>
              <span className="text-3xl font-black text-indigo-400 tracking-widest">{currentRoomId}</span>
              <button onClick={() => copyToClipboard(currentRoomId||'', setIsLogsCopied)} className="p-2.5 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors">{isLogsCopied ? <Check size={18} className="text-emerald-400"/> : <Copy size={18}/>}</button>
            </div>
          </div>
          <div className="text-[10px] font-black text-slate-500 tracking-widest uppercase mb-3 flex justify-between items-end">
            <span className="flex items-center gap-2"><Users size={14}/> 参加プレイヤー ({players.length})</span>
            {isHost2 && mode === 'team' && <span className="text-amber-500">ドラッグ＆ドロップでチーム変更可能</span>}
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar border border-slate-800 rounded-3xl p-4 bg-slate-950 mb-6" onTouchMove={onTouchMove} onTouchEnd={onTouchEndLobby}>
            {mode === 'individual' ? (
              <div className="flex flex-wrap gap-3">
                {players.map(p => (
                  <div key={p.id} className={`px-5 py-3 rounded-xl border font-bold text-sm flex items-center gap-3 ${p.uid===roomHostId ? 'bg-indigo-900/30 border-indigo-500/50 text-indigo-100' : 'bg-slate-900 border-slate-800 text-slate-200'}`}>
                    {p.uid===roomHostId ? <Trophy size={14} className="text-amber-400"/> : <Users size={14} className="text-slate-500"/>} {p.name}
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: teamCount }).map((_, ti) => (
                  <div key={ti} data-team-index={ti} onDragOver={onDragOver} onDrop={e => onDropLobby(e, ti)}
                    className={`p-4 rounded-2xl border transition-all ${touchTargetTeam===ti ? 'bg-indigo-600/20 border-indigo-500 ring-2 ring-indigo-500/30' : 'bg-slate-900 border-slate-800'}`}>
                    <h4 className="text-sm font-black text-indigo-400 uppercase tracking-widest mb-3">{teamNames[ti]||`チーム${String.fromCharCode(65+ti)}`}</h4>
                    <div className="min-h-[120px] flex flex-wrap gap-2 content-start">
                      {players.filter(p => p.teamIndex===ti).map(p => (
                        <div key={p.id} draggable={isHost2} onDragStart={e => onDragStart(e, p)} onTouchStart={e => onTouchStart(e, p)}
                          className={`bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800 font-bold text-sm flex items-center gap-2 ${isHost2 ? 'cursor-grab active:cursor-grabbing hover:border-slate-600' : ''} ${p.uid===roomHostId ? 'text-indigo-300' : 'text-slate-200'}`}>
                          {isHost2 && <GripVertical size={14} className="text-slate-600"/>} {p.uid===roomHostId && <Trophy size={12} className="text-amber-400"/>} {p.name}
                        </div>
                      ))}
                      {players.filter(p => p.teamIndex===ti).length === 0 && <div className="text-[10px] font-black text-slate-700 uppercase italic py-2 w-full text-center">Empty</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="shrink-0 space-y-3">
            {isHost2 && (
              <div className="flex items-center justify-center gap-3 w-full max-w-md mx-auto">
                {/* 観戦モード切り替えボタン（ロビー：参加/不参加） */}
                <button
                  onClick={async () => {
                    const next = !isSpectatorMode;
                    setIsSpectatorMode(next);
                    if (!currentRoomId) return;
                    try {
                      const data = await API.getRoom(currentRoomId);
                      if (!data) return;
                      if (next) {
                        // 観戦モードON → playersからホストを除外
                        const updated = (data.players || []).filter((p: Player) => p.uid !== myUid);
                        await API.patchRoom(currentRoomId, { players: updated });
                      } else {
                        // 観戦モードOFF → playersにホストを追加（まだいなければ）
                        if (!(data.players || []).find((p: Player) => p.uid === myUid)) {
                          const ti = data.settings?.mode === 'team' ? (data.players.length % (data.settings?.teamCount || 2)) : 0;
                          await API.patchRoom(currentRoomId, { players: [...(data.players || []), {
                            id: `p-${Date.now()}-${myUid}`, uid: myUid,
                            name: playerNameInput || 'HOST', hp: initialHP,
                            status: 'alive', teamIndex: ti,
                            team: data.settings?.mode === 'team' ? (data.settings?.teamNames?.[ti] || `チーム${String.fromCharCode(65+ti)}`) : null
                          }] });
                        }
                      }
                    } catch {}
                  }}
                  className={`flex-1 py-3 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 border ${isSpectatorMode ? 'bg-indigo-900/40 border-indigo-500/60 text-indigo-300' : 'bg-emerald-900/30 border-emerald-500/50 text-emerald-300'}`}>
                  <span className="text-base">{isSpectatorMode ? '👁️' : '🎮'}</span>
                  {isSpectatorMode ? '観戦中（参加しない）' : '参加中（プレイヤー）'}
                </button>
              </div>
            )}
            <div className="text-center">
              {isHost2 ? (
                <button onClick={startMultiplayerGame} disabled={players.length < 2} className={`w-full max-w-md mx-auto py-5 rounded-2xl font-black text-2xl transition-all shadow-2xl flex items-center justify-center gap-3 ${players.length >= 2 ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/30' : 'bg-slate-800 text-slate-600 border border-slate-700'}`}>
                  {players.length >= 2 ? <><Play fill="currentColor"/> ゲームスタート</> : '参加者を待っています...'}
                </button>
              ) : (
                <div className="bg-slate-800 border border-slate-700 w-full max-w-md mx-auto py-5 rounded-2xl font-black text-lg text-slate-400 flex items-center justify-center gap-3 animate-pulse">
                  <Clock size={20}/> ホストの開始を待機中...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'setup') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 flex items-center justify-center">
        <div className="w-full max-w-5xl bg-slate-900 rounded-[2.5rem] shadow-2xl border border-slate-800 overflow-hidden">
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-6 text-center shrink-0 flex justify-between items-center">
            {isMultiplayer && <div className="bg-black/20 px-3 py-1 rounded text-[10px] font-black text-indigo-100 uppercase tracking-widest">Multiplayer Mode</div>}
            <h1 className="text-2xl md:text-3xl font-black italic tracking-tighter text-white drop-shadow-lg uppercase flex-1 text-center">SURVIVAL ROULETTE</h1>
            {isMultiplayer && <div className="w-[100px]"/>}
          </div>

          <div className={`p-6 grid grid-cols-1 ${isMultiplayer ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-6 lg:h-[78vh] overflow-y-auto lg:overflow-hidden custom-scrollbar`}>
            {/* 左カラム */}
            <div className="space-y-4 flex flex-col min-h-0 lg:h-full overflow-hidden">
              <div className={`space-y-4 overflow-y-auto pr-1 custom-scrollbar shrink-0 ${isMultiplayer ? 'h-full' : 'max-h-[60%] lg:max-h-[65%]'}`}>
                <label className="text-[10px] font-black text-slate-500 tracking-widest uppercase flex items-center gap-2 px-1"><Settings2 size={12}/> 基本設定</label>
                <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                  <label className="text-[8px] font-black text-slate-500 tracking-widest block uppercase flex items-center gap-1"><Type size={8}/> タイトル</label>
                  <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="ゲームのタイトルを入力..." className="bg-transparent text-sm font-bold w-full outline-none text-white border-b border-slate-800 focus:border-indigo-500 pb-1"/>
                  <div className="flex gap-1 pt-2">
                    {['individual','team'].map(m => (
                      <button key={m} onClick={() => setMode(m)} className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all ${mode===m ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-500 hover:text-slate-300'}`}>{m==='individual' ? '個人戦' : 'チーム戦'}</button>
                    ))}
                  </div>
                </div>
                {mode === 'team' && (
                  <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                    <div>
                      <label className="text-[8px] font-black text-slate-500 tracking-widest block mb-1 uppercase">チーム数</label>
                      <input type="number" min="2" max="6" value={localTeamCount} onChange={e => setLocalTeamCount(e.target.value)} onBlur={e => { const v=Math.max(2,Math.min(6,parseInt(e.target.value)||2)); setTeamCount(v); setLocalTeamCount(String(v)); }} onKeyDown={e => { if(e.key==='Enter'){ (e.target as HTMLInputElement).blur(); } }} className="bg-transparent text-xl font-black w-full outline-none text-indigo-400 tabular-nums"/>
                    </div>
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <label className="text-[8px] font-black text-slate-500 tracking-widest block mb-1 uppercase flex items-center gap-1"><Edit3 size={8}/> チーム名設定</label>
                      <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                        {Array.from({ length: teamCount }).map((_, i) => (
                          <input key={i} type="text" value={teamNames[i]||''} onChange={e => updateTeamName(i, e.target.value)} placeholder={`チーム${String.fromCharCode(65+i)}`} className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-300 outline-none focus:border-indigo-500"/>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800"><label className="text-[8px] font-black text-slate-500 block mb-1 uppercase">初期HP</label><input type="number" value={localInitialHP} onChange={e => setLocalInitialHP(e.target.value)} onBlur={e => { const v=Math.max(1,parseInt(e.target.value)||1); setInitialHP(v); setLocalInitialHP(String(v)); }} onKeyDown={e => { if(e.key==='Enter'){ (e.target as HTMLInputElement).blur(); } }} className="bg-transparent text-lg font-black w-full outline-none text-indigo-400"/></div>
                  <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800"><label className="text-[8px] font-black text-slate-500 block mb-1 uppercase">速度 (秒)</label><input type="number" step="0.1" value={localSpinDuration} onChange={e => setLocalSpinDuration(e.target.value)} onBlur={e => { const v=Math.max(0.1,parseFloat(e.target.value)||0.1); setSpinDuration(v); setLocalSpinDuration(String(v)); }} onKeyDown={e => { if(e.key==='Enter'){ (e.target as HTMLInputElement).blur(); } }} className="bg-transparent text-lg font-black w-full outline-none text-amber-500"/></div>
                </div>
                <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800"><label className="text-[8px] font-black text-slate-500 block mb-1 uppercase">回復頻度 (ターン)</label><input type="number" value={localHealInterval} onChange={e => setLocalHealInterval(e.target.value)} onBlur={e => { const v=Math.max(1,parseInt(e.target.value)||1); setHealInterval(v); setLocalHealInterval(String(v)); }} onKeyDown={e => { if(e.key==='Enter'){ (e.target as HTMLInputElement).blur(); } }} className="bg-transparent text-lg font-black w-full outline-none text-emerald-500"/></div>
                <div className="space-y-2">
                  <button onClick={() => setIsHpBalanceEnabled(!isHpBalanceEnabled)} className={`w-full p-3 rounded-2xl border flex items-center justify-between transition-all ${isHpBalanceEnabled ? 'bg-emerald-600/10 border-emerald-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
                    <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Scale size={14}/> HPバランス調整</span>
                    <div className={`px-2 py-0.5 rounded text-[8px] font-black ${isHpBalanceEnabled ? 'bg-emerald-600' : 'bg-slate-800'}`}>{isHpBalanceEnabled ? 'ON' : 'OFF'}</div>
                  </button>
                  <button onClick={() => setIsSpecialEventEnabled(!isSpecialEventEnabled)} className={`w-full p-3 rounded-2xl border flex items-center justify-between transition-all ${isSpecialEventEnabled ? 'bg-purple-600/10 border-purple-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
                    <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">{isSpecialEventEnabled ? <ToggleRight size={14}/> : <ToggleLeft size={14}/>} 特別イベント</span>
                    <div className={`px-2 py-0.5 rounded text-[8px] font-black ${isSpecialEventEnabled ? 'bg-purple-600' : 'bg-slate-800'}`}>{isSpecialEventEnabled ? 'ON' : 'OFF'}</div>
                  </button>
                  {isSpecialEventEnabled && (
                    <div className="mt-2 space-y-3 ml-4 border-l-2 border-purple-500/20 pl-4 py-2">
                      <div className="p-3 bg-slate-950/50 rounded-2xl border border-purple-500/30 flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase">発生確率</span>
                        <div className="flex items-center gap-1 bg-purple-500/10 px-2 py-1 rounded-lg">
                          <input type="number" min="1" max="100" value={localSpecialEventProb} onChange={e => setLocalSpecialEventProb(e.target.value)} onBlur={e => { const v=Math.max(1,Math.min(100,parseInt(e.target.value)||1)); setSpecialEventProb(v); setLocalSpecialEventProb(String(v)); }} onKeyDown={e => { if(e.key==='Enter'){ (e.target as HTMLInputElement).blur(); } }} className="bg-transparent text-[10px] font-black w-8 outline-none text-purple-400 text-right tabular-nums"/>
                          <span className="text-[8px] font-black text-purple-400">%</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {[
                          { id: 'reverseMode',       label: 'リバース (以外全員)',           icon: <RotateCcw size={10}/> },
                          { id: 'multiMode',         label: 'マルチ (複数名同時)',           icon: <Users size={10}/> },
                          { id: 'feint',             label: 'ルーレットフェイント',           icon: <Zap size={10}/> },
                          { id: 'diceMode',          label: `ダイスルーレット (${diceConfig.minCount}${diceConfig.minCount!==diceConfig.maxCount?'~'+diceConfig.maxCount:''}d${diceConfig.faceMin>1?diceConfig.faceMin+'~':''}${diceConfig.faceMax})`, icon: <Percent size={10}/> },
                          { id: 'numberFormat',      label: '特殊数値形式',                 icon: <Type size={10}/> },
                          { id: 'reverseHealDamage', label: '回復・ダメージ逆転',           icon: <RotateCcw size={10}/> },
                          { id: 'instantDeath',      label: '脱落イベント (即死)',           icon: <Skull size={10}/> },
                          { id: 'trueRandom',        label: '完全ランダム (HPバランス無視)', icon: <Activity size={10}/> },
                        ].map(ev => (
                          <div key={ev.id} className="flex flex-col">
                            <button onClick={() => toggleSpecialEvent(ev.id)} className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${enabledSpecialEvents.includes(ev.id) ? 'bg-purple-600/20 border-purple-500/50 text-purple-100' : 'bg-slate-900 border-slate-800 text-slate-600'} ${enabledSpecialEvents.includes(ev.id) && ['diceMode','numberFormat'].includes(ev.id) ? 'rounded-b-none border-b-0' : ''}`}>
                              <span className="text-[9px] font-bold flex items-center gap-2">{ev.icon} {ev.label}</span>
                              <div className={`w-2 h-2 rounded-full ${enabledSpecialEvents.includes(ev.id) ? 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]' : 'bg-slate-700'}`}/>
                            </button>
                            {enabledSpecialEvents.includes(ev.id) && ev.id === 'diceMode' && (
                              <div className="pl-4 pr-2 py-2 bg-slate-900/50 rounded-b-xl border border-purple-500/50 border-t-0 space-y-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[9px] text-slate-400 w-10 shrink-0">個数:</span>
                                  <input type="number" min="1" max="20" value={localDiceMinCount}
                                    onChange={e => setLocalDiceMinCount(e.target.value)}
                                    onBlur={e => { const v=Math.max(1,Math.min(diceConfig.maxCount,parseInt(e.target.value)||1)); setDiceConfig(p=>({...p,minCount:v})); setLocalDiceMinCount(String(v)); }}
                                    onKeyDown={e => { if(e.key==='Enter'){ (e.target as HTMLInputElement).blur(); } }}
                                    className="w-10 bg-slate-950 border border-slate-800 rounded px-1 text-[10px] text-white text-center"/>
                                  <span className="text-slate-400 text-[9px]">〜</span>
                                  <input type="number" min="1" max="20" value={localDiceMaxCount}
                                    onChange={e => setLocalDiceMaxCount(e.target.value)}
                                    onBlur={e => { const v=Math.max(diceConfig.minCount,parseInt(e.target.value)||1); setDiceConfig(p=>({...p,maxCount:v})); setLocalDiceMaxCount(String(v)); }}
                                    onKeyDown={e => { if(e.key==='Enter'){ (e.target as HTMLInputElement).blur(); } }}
                                    className="w-10 bg-slate-950 border border-slate-800 rounded px-1 text-[10px] text-white text-center"/>
                                  <span className="text-slate-400 text-[9px]">個</span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[9px] text-slate-400 w-10 shrink-0">面数:</span>
                                  <input type="number" min="1" value={localDiceFaceMin}
                                    onChange={e => setLocalDiceFaceMin(e.target.value)}
                                    onBlur={e => { const v=Math.max(1,Math.min(diceConfig.faceMax,parseInt(e.target.value)||1)); setDiceConfig(p=>({...p,faceMin:v})); setLocalDiceFaceMin(String(v)); }}
                                    onKeyDown={e => { if(e.key==='Enter'){ (e.target as HTMLInputElement).blur(); } }}
                                    className="w-14 bg-slate-950 border border-slate-800 rounded px-1 text-[10px] text-white text-center"/>
                                  <span className="text-slate-400 text-[9px]">〜</span>
                                  <input type="number" min="1" value={localDiceFaceMax}
                                    onChange={e => setLocalDiceFaceMax(e.target.value)}
                                    onBlur={e => { const v=Math.max(diceConfig.faceMin,parseInt(e.target.value)||1); setDiceConfig(p=>({...p,faceMax:v})); setLocalDiceFaceMax(String(v)); }}
                                    onKeyDown={e => { if(e.key==='Enter'){ (e.target as HTMLInputElement).blur(); } }}
                                    className="w-14 bg-slate-950 border border-slate-800 rounded px-1 text-[10px] text-white text-center"/>
                                  <span className="text-slate-400 text-[9px]">面</span>
                                </div>
                              </div>
                            )}
                            {enabledSpecialEvents.includes(ev.id) && ev.id === 'numberFormat' && (
                              <div className="pl-3 pr-2 py-2 bg-slate-900/50 rounded-b-xl border border-purple-500/50 border-t-0">
                                {/* 全選択/全解除ボタン */}
                                <div className="flex gap-1.5 mb-2">
                                  <button
                                    onClick={() => setEnabledFormats(ALL_NUMBER_FORMATS.map(f => f.id))}
                                    className="flex-1 py-1 text-[8px] font-black bg-purple-700/40 hover:bg-purple-600/50 border border-purple-500/50 rounded-lg text-purple-200 transition-all active:scale-95"
                                  >全選択</button>
                                  <button
                                    onClick={() => setEnabledFormats([])}
                                    className="flex-1 py-1 text-[8px] font-black bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-slate-400 transition-all active:scale-95"
                                  >全解除</button>
                                </div>
                                <div className="grid grid-cols-2 gap-y-1.5 gap-x-1 max-h-40 overflow-y-auto custom-scrollbar">
                                  {ALL_NUMBER_FORMATS.map(fmt => (
                                    <label key={fmt.id} className="flex items-center gap-1.5 text-[9px] text-slate-300 cursor-pointer">
                                      <input type="checkbox" checked={enabledFormats.includes(fmt.id)} onChange={() => setEnabledFormats(prev => prev.includes(fmt.id) ? prev.filter(id => id !== fmt.id) : [...prev, fmt.id])} className="accent-purple-500 w-3 h-3 shrink-0"/>
                                      <span className="truncate">{fmt.label}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {/* 無敵バリアカードイベント */}
                      <button onClick={() => setIsBarrierEventEnabled(!isBarrierEventEnabled)} className={`w-full p-2.5 rounded-xl border flex items-center justify-between transition-all ${isBarrierEventEnabled ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-100' : 'bg-slate-900 border-slate-800 text-slate-600'}`}>
                        <span className="text-[9px] font-bold flex items-center gap-2">🛡️ 無敵バリアカード付与</span>
                        <div className={`w-2 h-2 rounded-full ${isBarrierEventEnabled ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]' : 'bg-slate-700'}`}/>
                      </button>
                      {/* 国道ダメージ/回復イベント */}
                      <button onClick={() => setIsRoadEventEnabled(!isRoadEventEnabled)} className={`w-full p-2.5 rounded-xl border flex items-center justify-between transition-all ${isRoadEventEnabled ? 'bg-orange-600/20 border-orange-500/50 text-orange-100' : 'bg-slate-900 border-slate-800 text-slate-600'}`}>
                        <span className="text-[9px] font-bold flex items-center gap-2">🛣️ 国道ダメージ/回復</span>
                        <div className={`w-2 h-2 rounded-full ${isRoadEventEnabled ? 'bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.6)]' : 'bg-slate-700'}`}/>
                      </button>
                      {/* 特別イベント重複発動 */}
                      <button onClick={() => setIsSpecialMultiEnabled(!isSpecialMultiEnabled)} className={`w-full p-2.5 rounded-xl border flex items-center justify-between transition-all ${isSpecialMultiEnabled ? 'bg-amber-600/20 border-amber-500/50 text-amber-100 rounded-b-none border-b-0' : 'bg-slate-900 border-slate-800 text-slate-600'}`}>
                        <span className="text-[9px] font-bold flex items-center gap-2"><Zap size={10}/> イベント重複発動</span>
                        <div className={`w-2 h-2 rounded-full ${isSpecialMultiEnabled ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'bg-slate-700'}`}/>
                      </button>
                      {isSpecialMultiEnabled && (
                        <div className="bg-amber-950/30 border border-amber-500/30 border-t-0 rounded-b-xl px-3 py-2 flex items-center gap-2">
                          <span className="text-[9px] text-amber-400 font-bold">重複確率</span>
                          <input type="number" min={1} max={100} value={specialMultiProb}
                            onChange={e => setSpecialMultiProb(Math.max(1,Math.min(100,parseInt(e.target.value)||1)))}
                            onKeyDown={e => { if (e.key === 'Enter') { const v = Math.max(1,Math.min(100,parseInt((e.target as HTMLInputElement).value)||1)); setSpecialMultiProb(v); (e.target as HTMLInputElement).blur(); } }}
                            className="w-12 bg-slate-900 border border-amber-500/40 rounded-lg text-center text-[10px] font-black text-amber-300 outline-none px-1 py-0.5"/>
                          <span className="text-[9px] text-amber-500 font-bold">%</span>
                        </div>
                      )}
                    </div>
                  )}
                  {!isMultiplayer && (
                    <button onClick={() => setIsManualModeEnabled(!isManualModeEnabled)} className={`w-full p-3 rounded-2xl border flex items-center justify-between transition-all ${isManualModeEnabled ? 'bg-amber-600/10 border-amber-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
                      <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Hand size={14}/> 手動選択 (41-60T)</span>
                      <div className={`px-2 py-0.5 rounded text-[8px] font-black ${isManualModeEnabled ? 'bg-amber-600' : 'bg-slate-800'}`}>{isManualModeEnabled ? 'ON' : 'OFF'}</div>
                    </button>
                  )}
                </div>
              </div>
              {!isMultiplayer && (
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden pt-2 border-t border-slate-800">
                  <label className="text-[10px] font-black text-slate-500 tracking-widest block mb-2 uppercase flex items-center gap-2 px-1"><Users size={12}/> プレイヤーリスト</label>
                  <textarea value={playerListText} onChange={e => setPlayerListText(e.target.value)} placeholder="名前を改行で入力..." className="flex-1 w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm custom-scrollbar resize-none"/>
                </div>
              )}
            </div>

            {/* 中カラム（シングルのみ） */}
            {!isMultiplayer && (
              <div className="space-y-4 flex flex-col min-h-[500px] lg:min-h-0 lg:h-full overflow-hidden">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[10px] font-black text-slate-500 tracking-widest uppercase flex items-center gap-2"><UserPlus size={12}/> {mode==='team' ? 'チーム分け (ドラッグ可能)' : '参加者確認'}</label>
                  {mode==='team' && <button onClick={autoAssignTeams} className="text-[8px] font-black px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-all uppercase">自動振分</button>}
                </div>
                <div className="flex-1 bg-slate-950 rounded-2xl border border-slate-800 p-2 overflow-y-auto custom-scrollbar space-y-4" onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
                  {mode === 'individual'
                    ? (manualPlayers.length === 0
                        ? <p className="text-[10px] text-slate-600 font-bold text-center mt-10 uppercase italic">名前を入力してください</p>
                        : manualPlayers.map((p, i) => <div key={i} className="flex items-center gap-2 bg-slate-900 p-2 rounded-xl border border-slate-800/50"><div className="flex-1 truncate text-xs font-bold px-1">{p.name}</div></div>))
                    : (
                      <div className="space-y-4">
                        {Array.from({ length: teamCount }).map((_, ti) => (
                          <div key={ti} data-team-index={ti} onDragOver={onDragOver} onDrop={e => onDrop(e, ti)} className={`p-3 rounded-2xl border transition-all ${touchTargetTeam===ti ? 'bg-indigo-600/20 border-indigo-500 ring-2 ring-indigo-500/30' : 'bg-slate-900/50 border-slate-800'}`}>
                            <h4 className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2 px-1">{teamNames[ti]||`チーム${String.fromCharCode(65+ti)}`}</h4>
                            <div className="min-h-[40px] flex flex-wrap gap-2">
                              {manualPlayers.filter(p => p.teamIndex===ti).length === 0
                                ? <div className="w-full text-center py-2 text-[8px] text-slate-700 font-bold uppercase italic">No Members</div>
                                : manualPlayers.filter(p => p.teamIndex===ti).map(p => (
                                  <div key={p.name} draggable onDragStart={e => onDragStart(e, p)} onTouchStart={e => onTouchStart(e, p)} className={`flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 cursor-grab active:cursor-grabbing hover:border-slate-600 transition-colors shadow-sm ${draggedPlayer?.name===p.name ? 'opacity-50 border-indigo-500' : ''}`}>
                                    <GripVertical size={10} className="text-slate-600"/><span className="text-[10px] font-bold text-slate-300 pointer-events-none">{p.name}</span>
                                  </div>
                                ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* 右カラム */}
            <div className={`space-y-6 flex flex-col min-h-[500px] lg:min-h-0 lg:h-full overflow-hidden ${isMultiplayer ? 'pb-20' : ''}`}>
              <div className="space-y-4 flex-1 overflow-y-auto pr-1 custom-scrollbar min-h-0">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2"><Percent size={12}/> ルーレット構成</label>
                    <button onClick={addFixedItem} className="p-1.5 bg-indigo-600 rounded-lg text-white"><Plus size={14}/></button>
                  </div>
                  <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400">ランダム範囲</span>
                      <div className="flex items-center gap-1 bg-indigo-500/10 px-2 py-1 rounded-lg">
                        <input type="number" value={localRangeProb} onChange={e => setLocalRangeProb(e.target.value)} onBlur={e => { const v=Math.max(0,Math.min(100,parseInt(e.target.value)||0)); setConfig(c=>({...c,rangeProb:v})); setLocalRangeProb(String(v)); }} onKeyDown={e => { if(e.key==='Enter'){ (e.target as HTMLInputElement).blur(); } }} className="bg-transparent text-[10px] font-black w-6 outline-none text-indigo-400 text-right"/>
                        <span className="text-[8px] font-black text-indigo-400">%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="number" value={localRangeMin} onChange={e => setLocalRangeMin(e.target.value)} onBlur={e => { const v=Math.max(1,parseInt(e.target.value)||1); setConfig(c=>({...c,rangeMin:v})); setLocalRangeMin(String(v)); }} onKeyDown={e => { if(e.key==='Enter'){ (e.target as HTMLInputElement).blur(); } }} className="w-full bg-slate-900 p-2 rounded-xl text-center font-black text-xs border border-slate-800"/>
                      <span className="text-slate-700">~</span>
                      <input type="number" value={localRangeMax} onChange={e => setLocalRangeMax(e.target.value)} onBlur={e => { const v=Math.max(1,parseInt(e.target.value)||1); setConfig(c=>({...c,rangeMax:v})); setLocalRangeMax(String(v)); }} onKeyDown={e => { if(e.key==='Enter'){ (e.target as HTMLInputElement).blur(); } }} className="w-full bg-slate-900 p-2 rounded-xl text-center font-black text-xs border border-slate-800"/>
                    </div>
                  </div>
                  {config.fixedItems.map(item => (
                    <div key={item.id} className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex items-center gap-2">
                      <input type="number" value={item.value} onChange={e => updateFixedItemValue(item.id, 'value', e.target.value)} onBlur={e => handleFixedItemComplete(e, item.id, 'value', 1)} onKeyDown={e => { if(e.key==='Enter'){ (e.target as HTMLInputElement).blur(); } }} className="w-16 bg-slate-900 p-2 rounded-xl text-center font-black text-xs border border-slate-800"/>
                      <div className="flex-1 flex items-center gap-1 bg-slate-900 p-2 rounded-xl border border-slate-800">
                        <input type="number" value={item.prob} onChange={e => updateFixedItemValue(item.id, 'prob', e.target.value)} onBlur={e => handleFixedItemComplete(e, item.id, 'prob', 0)} onKeyDown={e => { if(e.key==='Enter'){ (e.target as HTMLInputElement).blur(); } }} className="w-full bg-transparent text-[10px] font-black text-right outline-none text-indigo-400"/>
                        <span className="text-[8px] text-slate-500">%</span>
                      </div>
                      <button onClick={() => removeFixedItem(item.id)} className="p-2 text-red-500"><Trash2 size={14}/></button>
                    </div>
                  ))}
                </div>
                <div className="space-y-3 pt-4 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2"><ShieldAlert size={12}/> 復活設定</label>
                    <button onClick={addReviveEvent} className="p-1.5 bg-purple-600 rounded-lg text-white"><Plus size={14}/></button>
                  </div>
                  {reviveEvents.map(rev => (
                    <div key={rev.id} className="p-3 bg-slate-950 rounded-2xl border border-purple-900/30 flex items-center gap-2">
                      <input type="number" value={reviveTurnInputs[rev.id] ?? String(rev.turn)}
                        onChange={e => setReviveTurnInputs(prev => ({ ...prev, [rev.id]: e.target.value }))}
                        onBlur={e => { const v = Math.max(1, parseInt(e.target.value) || 1); updateReviveEventState(rev.id, 'turn', String(v)); setReviveTurnInputs(prev => ({ ...prev, [rev.id]: String(v) })); }}
                        onKeyDown={e => { if (e.key === 'Enter') { const v = Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1); updateReviveEventState(rev.id, 'turn', String(v)); setReviveTurnInputs(prev => ({ ...prev, [rev.id]: String(v) })); (e.target as HTMLInputElement).blur(); } }}
                        className="w-14 bg-slate-900 p-2 rounded-xl text-center font-black text-xs border border-slate-800 text-purple-400"/>
                      <div className="flex-1 flex gap-1">
                        {(['steal','copy'] as const).map(t => (
                          <button key={t} onClick={() => updateReviveEventState(rev.id, 'type', t)} className={`flex-1 py-1.5 rounded-lg text-[8px] font-bold ${rev.type===t ? 'bg-purple-600 text-white' : 'bg-slate-900 text-slate-600'}`}>{t==='steal' ? '奪う' : 'コピー'}</button>
                        ))}
                      </div>
                      <button onClick={() => removeReviveEvent(rev.id)} className="text-slate-600"><Trash2 size={12}/></button>
                    </div>
                  ))}
                </div>
              </div>
              {isMultiplayer ? (
                <div className="absolute bottom-6 right-6 left-6 lg:left-[51%]">
                  <button onClick={handleCreateRoom} disabled={totalProb !== 100} className={`w-full py-5 rounded-2xl font-black text-xl transition-all active:scale-95 flex items-center justify-center gap-3 text-white ${totalProb===100 ? 'bg-indigo-600 hover:bg-indigo-500 shadow-xl shadow-indigo-500/20' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}>ルーム作成 (次へ)</button>
                </div>
              ) : (
                <div className="shrink-0 pt-2">
                  <button onClick={startGameSingle} disabled={totalProb !== 100 || manualPlayers.length < 2} className={`w-full py-5 rounded-2xl font-black text-xl transition-all active:scale-95 flex items-center justify-center gap-3 text-white ${totalProb===100 && manualPlayers.length >= 2 ? 'bg-indigo-600 hover:bg-indigo-500 shadow-xl shadow-indigo-500/20' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}><Play fill="currentColor" size={24}/> BATTLE START</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'result') {
    const ranking = getCombinedRanking();
    const alive = players.filter(p => p.status === 'alive');
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 flex flex-col items-center justify-center max-w-[1200px] mx-auto w-full">
        <div className="w-full bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 md:p-10 shadow-2xl flex flex-col gap-6">
          <div className="text-center">
            <div className="inline-block p-4 bg-indigo-900/30 rounded-3xl border border-indigo-500/20 mb-3"><Trophy size={36} className="text-amber-400 animate-bounce"/></div>
            <h1 className="text-3xl md:text-5xl font-black italic uppercase tracking-tighter text-white">RESULT</h1>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">生存競争、決着</p>
          </div>
          <div className="bg-slate-950 border border-slate-800/80 rounded-3xl p-6 text-center max-w-lg mx-auto w-full">
            <div className="text-[10px] font-black text-indigo-400 tracking-[0.2em] uppercase mb-1">WINNER</div>
            {alive.length > 0
              ? <><div className="text-2xl md:text-3xl font-black text-amber-400 mb-1">{mode==='team' ? alive[0].team : alive[0].name}</div><div className="text-slate-400 text-xs font-bold">第{turn}ターンを耐え抜き、勝利を掴み取った！</div></>
              : <div className="text-slate-500 font-bold text-lg">勝者なし (全員脱落)</div>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start min-h-0 md:h-[500px] w-full">
            <div className="bg-slate-950 border border-slate-800/60 rounded-3xl p-4 flex flex-col h-[350px] md:h-full overflow-hidden">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 px-1 flex items-center gap-2 shrink-0"><Trophy size={14} className="text-amber-500"/> 最終順位</label>
              <RankingList ranking={ranking}/>
            </div>
            <div className="flex flex-col gap-4 h-[400px] md:h-full w-full overflow-hidden">
              <div className="bg-slate-950 border border-slate-800/60 rounded-3xl p-4 flex flex-col justify-center gap-2 shrink-0">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 px-1">結果を出力する</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={copyRanking} className="p-3 bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all">{isRankingCopied ? <Check size={14} className="text-emerald-400"/> : <Copy size={14}/>} 通常テキスト</button>
                  <button onClick={copyDiscordRanking} className="p-3 bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all">{isDiscordCopied ? <Check size={14} className="text-emerald-400"/> : <Copy size={14}/>} Discord形式</button>
                  <button onClick={copyLogs} className="p-3 bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all col-span-2">{isLogsCopied ? <Check size={14} className="text-emerald-400"/> : <History size={14}/>} ターンログをコピー</button>
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800/60 rounded-3xl p-4 flex-1 flex flex-col overflow-hidden min-h-0">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1 shrink-0">ログ一覧</label>
                <div className="overflow-y-auto flex-1 space-y-1.5 pr-1 custom-scrollbar">
                  {logs.slice(0, 50).map(log => (
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
            <button onClick={backToHome} className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white font-black text-lg rounded-2xl border border-slate-700 hover:border-slate-500 transition-all flex items-center justify-center gap-2"><RotateCcw size={18}/> ホームに戻る</button>
            <button onClick={isMultiplayer ? startMultiplayerGame : startGameSingle} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-lg rounded-2xl shadow-xl shadow-indigo-500/10 transition-all flex items-center justify-center gap-2"><Play fill="currentColor" size={18}/> もう一度遊ぶ</button>
          </div>
        </div>
      </div>
    );
  }

  // ========== RENDER: playing ==========
  const nextEvent = (() => {
    const nextRevive = reviveEvents.filter(r => r.turn >= turn).sort((a,b) => a.turn-b.turn)[0];
    const nextHeal = Math.ceil(turn / healInterval) * healInterval;
    const list: {name:string;val:number}[] = [];
    if (nextRevive) list.push({ name: `${nextRevive.turn}T:復活`, val: nextRevive.turn });
    if (nextHeal > turn) list.push({ name: `${nextHeal}T:回復`, val: nextHeal });
    if (list.length === 0) return { name: '最終決戦', remaining: '-' as string | number };
    const nearest = list.sort((a,b) => a.val-b.val)[0];
    return { name: nearest.name, remaining: nearest.val - turn };
  })();

  const survivorsSorted = players.filter(p => p.status === 'alive').sort((a,b) => b.hp - a.hp);
  const totalSurvivorHp = survivorsSorted.reduce((s,p) => s + p.hp, 0);
  // ダイス表示かどうか
  const isDiceDisplay = typeof displayResult.amount === 'string' && String(displayResult.amount).includes('[') && String(displayResult.amount).includes('d');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 flex flex-col md:flex-row gap-6 max-w-[1500px] mx-auto font-sans md:overflow-hidden md:h-screen">
      <div className="flex-1 flex flex-col gap-6 md:overflow-hidden md:h-full">
        {/* ターン表示 */}
        <div className="bg-slate-900 rounded-3xl p-6 border-b-4 border-indigo-600 flex justify-between items-center shadow-2xl shrink-0">
          <div className="flex items-center gap-5 truncate">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center font-black text-2xl text-white tabular-nums shrink-0">{turn}</div>
            <div className="truncate">
              <div className="text-indigo-400 font-black text-[11px] tracking-widest uppercase truncate">{title}</div>
              <div className="text-xl font-black italic text-white truncate">{isReviveTurn ? 'SPECIAL EVENT' : isHealTurn ? 'HEALING TIME' : 'BATTLE ROUND'}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {isMultiplayer && (
              <button onClick={backToHome} className="px-3 py-2 bg-slate-800 hover:bg-red-900/40 border border-slate-700 hover:border-red-700 text-slate-400 hover:text-red-400 rounded-xl font-bold text-xs transition-all flex items-center gap-1">
                <RotateCcw size={12}/> 退室
              </button>
            )}
            <div className="text-right px-5 py-3 bg-slate-950 rounded-2xl border border-slate-800">
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{nextEvent.name}まで</div>
              <div className="text-base font-black text-amber-500 italic">{nextEvent.remaining === '-' ? 'CLIMAX' : `${nextEvent.remaining} TURN`}</div>
            </div>
          </div>
        </div>

        {/* メインルーレット */}
        <div className="bg-slate-900 rounded-[3rem] p-8 border border-slate-800 flex flex-col items-center justify-center relative flex-1 shrink-0 overflow-hidden min-h-[350px]">
          <div className="absolute top-8 right-10 flex flex-col items-end gap-2 z-10">
            {isReviveTurn ? <div className="bg-purple-600 text-white px-5 py-2 rounded-xl text-sm font-black animate-pulse flex items-center gap-2"><Sparkles size={16}/> REVIVE</div>
              : isHealTurn ? <div className="bg-emerald-600 text-white px-5 py-2 rounded-xl text-sm font-black flex items-center gap-2"><Heart size={16} fill="currentColor"/> HEAL</div>
              : <div className="bg-slate-950 text-red-500 border border-red-900/40 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-[0.2em]">Battle Phase</div>}
            {(lastResult?.isReverse || lastResult?.isMulti) && <div className="bg-amber-600 text-white px-3 py-1 rounded-lg text-[10px] font-black animate-bounce">SPECIAL EVENT!</div>}
          </div>

          <div className="absolute top-8 left-10 flex flex-col gap-2 z-10">
            {isMultiplayer && <div className="bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Activity size={14}/> ONLINE</div>}
            {isHpBalanceEnabled && <div className="bg-emerald-600/20 text-emerald-500 border border-emerald-500/30 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Scale size={14}/> BALANCED</div>}
            {activeNumberFormat !== 'default' && <div className="bg-amber-600/20 text-amber-500 border border-amber-500/30 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest animate-pulse flex items-center gap-2"><Type size={14}/> {ALL_NUMBER_FORMATS.find(f=>f.id===activeNumberFormat)?.label || activeNumberFormat}</div>}
          </div>

          <div className="text-center w-full px-6 relative z-10 flex flex-col items-center">
            <div className={`text-3xl md:text-5xl lg:text-6xl font-black mb-6 tracking-tighter italic truncate max-w-full ${lastResult?.isReverse || lastResult?.isMulti ? 'text-amber-400' : 'text-white'}`}>
              {displayResult.player}
            </div>
            {/* ダイス表示：サイズを小さくして横並び表示 */}
            {isDiceDisplay
              ? <div className={`text-2xl md:text-4xl font-black leading-tight transition-all duration-75 tabular-nums text-center break-all ${isSpinning ? 'text-slate-800 scale-95 blur-[2px]' : (lastResult?.type==='heal' || lastResult?.type==='revive' ? 'text-emerald-400' : 'text-red-600')}`}
                  style={getNumberFontStyle(activeNumberFormat)}>
                  {String(displayResult.amount)}
                </div>
              : <div className={`text-[5rem] md:text-[8rem] lg:text-[9rem] font-black leading-none transition-all duration-75 tabular-nums break-all ${isSpinning ? 'text-slate-800 scale-95 blur-[2px]' : (lastResult?.type==='heal' || lastResult?.type==='revive' ? 'text-emerald-400' : 'text-red-600')}`}
                  style={getNumberFontStyle(activeNumberFormat)}>
                  {displayResult.amount}
                </div>
            }
          </div>

          <div className="mt-10 w-full max-w-[320px] relative z-10">
            {isManualSelectionPhase ? (
              <div className="space-y-4 w-full">
                <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest text-center animate-pulse">対象を選択してください（未選択でスキップ）</div>
                <button onClick={applyManualSelection} className="w-full py-6 rounded-[2rem] font-black text-2xl shadow-2xl transition-all active:scale-95 border-b-[10px] flex items-center justify-center gap-4 bg-indigo-600 border-indigo-900 text-white hover:brightness-110">
                  <Zap size={24} fill="currentColor"/> {selectedPlayerIds.length > 0 ? `APPLY (${selectedPlayerIds.length})` : 'SKIP THIS ROUND'}
                </button>
              </div>
            ) : (
              <div className="space-y-3 w-full">
                {/* 観戦モード表示（ホストが観戦者の場合のみ） */}
                {isMultiplayer && isHost && isSpectatorMode && (
                  <div className="w-full py-2 rounded-2xl font-black text-sm flex items-center justify-center gap-2 bg-indigo-900/30 border border-indigo-500/40 text-indigo-300">
                    <span>👁️</span> 観戦中（プレイヤーとして参加していません）
                  </div>
                )}
                <button onClick={spinRoulette} disabled={isSpinning || (isMultiplayer && !isHost)} className={`w-full py-6 rounded-[2rem] font-black text-2xl shadow-2xl transition-all active:scale-95 border-b-[10px] flex items-center justify-center gap-4 ${isSpinning || (isMultiplayer && !isHost) ? 'bg-slate-800 border-slate-950 text-slate-600' : isReviveTurn ? 'bg-purple-600 border-purple-900 text-white' : isHealTurn ? 'bg-emerald-600 border-emerald-900 text-white' : 'bg-red-600 border-red-900 text-white hover:brightness-110'} ${(isMultiplayer && !isHost) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {isSpinning ? <RotateCcw className="animate-spin"/> : isMultiplayer && !isHost ? 'WAITING FOR HOST' : 'SPIN'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ログ */}
        <div className="bg-slate-900 rounded-3xl p-6 border border-slate-800 flex flex-col overflow-hidden h-[200px] shrink-0">
          <div className="text-slate-500 font-black text-[11px] tracking-[0.3em] uppercase flex items-center gap-2 mb-4"><History size={16}/> ACTIVITY LOGS</div>
          <div className="overflow-y-auto flex-1 space-y-2 pr-1 custom-scrollbar">
            {logs.map(log => (
              <div key={log.id} className={`flex items-center gap-4 p-4 rounded-2xl border ${log.type==='damage' ? 'bg-red-500/5 border-red-500/10' : log.type==='heal' ? 'bg-emerald-500/5 border-emerald-500/10' : log.type==='revive' ? 'bg-purple-500/5 border-purple-500/10' : 'bg-slate-950 border-slate-800/60'}`}>
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shrink-0 font-black text-[10px] text-slate-500">T{log.turn}</div>
                <span className={`text-sm font-bold truncate flex-1 ${log.type==='death' ? 'text-red-400' : 'text-slate-200'}`}>{log.message}</span>
                {log.amount !== undefined && log.type !== 'revive' && typeof log.amount === 'number' && (
                  <span className={`text-base font-black shrink-0 px-3 py-1 rounded-xl tabular-nums ${log.type==='damage' ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                    {log.type==='damage' ? '-' : '+'}{log.amount}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* サイドパネル */}
      <div className="md:w-[360px] flex flex-col gap-6 md:overflow-hidden md:h-full shrink-0">
        <div className="bg-slate-900 rounded-[2.5rem] p-6 border border-slate-800 flex flex-col h-1/2 min-h-[300px]">
          <div className="text-slate-500 font-black text-[11px] mb-5 uppercase flex items-center justify-between px-2 tracking-[0.2em]">
            <span className="flex items-center gap-2 text-white"><Users size={16}/> 生存者</span>
            <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-[11px] tabular-nums">{survivorsSorted.length}</span>
          </div>
          <div className="space-y-3 overflow-y-auto flex-1 pr-1 custom-scrollbar">
            {survivorsSorted.map(p => {
              const lowHp = p.hp <= initialHP * 0.3;
              const isSelected = selectedPlayerIds.includes(p.id);
              const targetedProb = isHpBalanceEnabled
                ? Math.round((p.hp / (totalSurvivorHp || 1)) * 100)
                : Math.round(100 / (survivorsSorted.length || 1));
              const isAnimating = animatingPlayerIds.includes(p.id) || (animatingPlayerIds.includes('SPECIAL') && lastResult?.player !== p.name);
              return (
                <div key={p.id} onClick={() => isManualSelectionPhase && togglePlayerSelection(p.id)}
                  className={`bg-slate-950 p-4 rounded-2xl border flex flex-col gap-2 relative overflow-hidden transition-all duration-300 ${isManualSelectionPhase ? 'cursor-pointer hover:border-indigo-500' : ''} ${isSelected ? 'border-indigo-500 ring-4 ring-indigo-500/20 bg-indigo-500/5' : isAnimating && (animatingType==='damage' || animatingType==='heal') ? (animatingType==='damage' ? 'border-red-500 ring-4 ring-red-500/20 bg-red-500/5' : 'border-emerald-500 ring-4 ring-emerald-500/20 bg-emerald-500/5') : (lowHp ? 'border-red-900 animate-pulse bg-red-950/10' : 'border-slate-800 hover:border-slate-700')}`}>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 truncate pr-2">
                      {isManualSelectionPhase && <div className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-700'}`}>{isSelected && <Check size={10} className="text-white"/>}</div>}
                      {lowHp && <ShieldAlert size={14} className="text-red-500 shrink-0"/>}
                      <span className={`font-bold text-sm truncate italic ${p.teamColor || 'text-slate-200'}`}>{p.team ? `[${p.team}] ` : ''}{p.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(p.barriers||0) > 0 && (
                        <div className="flex items-center gap-0.5 bg-cyan-900/40 border border-cyan-500/40 rounded-lg px-1.5 py-0.5">
                          <span className="text-[10px]">🛡️</span>
                          <span className="text-[10px] font-black text-cyan-400 tabular-nums">×{p.barriers}</span>
                        </div>
                      )}
                      <span className={`text-lg font-black tabular-nums ${lowHp ? 'text-red-500' : 'text-emerald-400'}`}>{p.hp}</span>
                    </div>
                  </div>
                  {isHpBalanceEnabled && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 bg-slate-900 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-500 ${targetedProb > 25 ? 'bg-amber-500' : 'bg-slate-700'}`} style={{ width: `${targetedProb}%` }}/>
                      </div>
                      <span className="text-[9px] font-black text-slate-500 tabular-nums">狙われやすさ: {targetedProb}%</span>
                    </div>
                  )}
                  {isAnimating && (animatingType === 'damage' || animatingType === 'heal') && (
                    <div className={`absolute inset-0 flex items-center justify-center font-black text-2xl animate-out fade-out slide-out-to-top-8 duration-1000 ${animatingType==='damage' ? 'text-red-500' : 'text-emerald-400'}`}>
                      {animatingType==='damage' ? `-${lastResult?.amount}` : `+${lastResult?.amount}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-slate-900 rounded-[2.5rem] p-6 border border-slate-800 flex flex-col h-1/2 min-h-[300px] overflow-hidden">
          <div className="text-slate-500 font-black text-[11px] uppercase flex items-center gap-2 mb-4 tracking-[0.2em] px-2"><Trophy size={16} className="text-amber-500"/> ランキング</div>
          <RankingList ranking={getCombinedRanking()}/>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; border: 2px solid transparent; background-clip: padding-box; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        [draggable="true"] { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
        @keyframes barrierFadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes barrierFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .barrier-fadeout { animation: barrierFadeOut 0.5s ease-in forwards; }
        .barrier-fadein { animation: barrierFadeIn 0.5s ease-out forwards; }

        /* ===== バリアメガ演出専用アニメーション ===== */
        @keyframes bmRipple {
          0%   { transform: translate(-50%,-50%) scale(0.2); opacity: 0.9; }
          100% { transform: translate(-50%,-50%) scale(3.5); opacity: 0; }
        }
        @keyframes bmStar {
          0%   { transform: translate(-50%,-50%) scale(0) rotate(0deg);   opacity: 1; }
          60%  { transform: translate(-50%,-50%) scale(1.4) rotate(180deg); opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(0.8) rotate(270deg); opacity: 0; }
        }
        @keyframes bmIconDrop {
          0%   { transform: translateY(-40px) scale(0.5); opacity: 0; }
          60%  { transform: translateY(8px) scale(1.15); opacity: 1; }
          80%  { transform: translateY(-4px) scale(1.05); }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes bmTextReveal {
          0%   { opacity: 0; transform: scale(0.6) translateY(16px); letter-spacing: 0.05em; }
          70%  { opacity: 1; transform: scale(1.08) translateY(-3px); letter-spacing: 0.18em; }
          100% { opacity: 1; transform: scale(1) translateY(0);       letter-spacing: 0.12em; }
        }
        @keyframes bmSubText {
          0%   { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes bmPulse {
          0%,100% { text-shadow: 0 0 10px #67e8f9, 0 0 28px #22d3ee, 0 0 55px #0891b2; }
          50%      { text-shadow: 0 0 20px #a5f3fc, 0 0 50px #67e8f9, 0 0 90px #22d3ee; }
        }
        @keyframes bmShieldFloat {
          0%,100% { transform: translateY(0px) scale(1); filter: drop-shadow(0 0 14px #22d3ee); }
          50%      { transform: translateY(-10px) scale(1.08); filter: drop-shadow(0 0 28px #67e8f9); }
        }
        @keyframes bmParticle {
          0%   { transform: translate(0,0) scale(1); opacity: 0.9; }
          100% { transform: var(--px, translate(60px,-80px)) scale(0); opacity: 0; }
        }
        @keyframes bmBannerSlide {
          0%   { transform: translateY(-60px); opacity: 0; }
          100% { transform: translateY(0);     opacity: 1; }
        }
        @keyframes bmCounterGlow {
          0%,100% { color: #67e8f9; text-shadow: 0 0 8px #22d3ee; }
          50%      { color: #ffffff; text-shadow: 0 0 20px #a5f3fc, 0 0 40px #67e8f9; }
        }
        .bm-icon     { animation: bmIconDrop 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.3s both; }
        .bm-main     { animation: bmTextReveal 0.8s cubic-bezier(0.34,1.56,0.64,1) 0.8s both, bmPulse 2s ease-in-out 1.5s infinite; }
        .bm-sub      { animation: bmSubText 0.5s ease-out 1.4s both; }
        .bm-badge    { animation: bmSubText 0.5s ease-out 1.7s both, bmCounterGlow 1.5s ease-in-out 2.2s infinite; }
        .bm-banner   { animation: bmBannerSlide 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.1s both; }
        .bm-shield   { animation: bmShieldFloat 2.5s ease-in-out 1.0s infinite; }
        .bm-ripple   { animation: bmRipple 1.4s ease-out forwards; }
        .bm-ripple2  { animation: bmRipple 1.4s ease-out 0.25s forwards; }
        .bm-ripple3  { animation: bmRipple 1.4s ease-out 0.5s forwards; }
        .bm-star     { animation: bmStar 1.0s ease-out forwards; }
      `}}/>

      {/* ===== バリアメガ付与フェードオーバーレイ ===== */}
      {barrierMegaAnimPhase && (
        <div
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center pointer-events-none
            ${barrierMegaAnimPhase === 'fadeout' ? 'barrier-fadeout' : barrierMegaAnimPhase === 'fadein' ? 'barrier-fadein' : ''}`}
          style={{
            background: 'radial-gradient(ellipse at center, #1a0044 0%, #06001a 55%, #000000 100%)',
            opacity: barrierMegaAnimPhase === 'result' ? 1 : undefined,
          }}
        >
          {/* 粒子エフェクト（固定位置に散らばる小丸） */}
          {[
            { top:'18%', left:'22%', size:6,  delay:'0.1s', px:'translate(-70px,-90px)' },
            { top:'15%', left:'72%', size:5,  delay:'0.3s', px:'translate(60px,-100px)' },
            { top:'75%', left:'18%', size:7,  delay:'0.2s', px:'translate(-80px,70px)' },
            { top:'78%', left:'78%', size:5,  delay:'0.4s', px:'translate(90px,80px)' },
            { top:'30%', left:'12%', size:4,  delay:'0.5s', px:'translate(-50px,-40px)' },
            { top:'65%', left:'85%', size:4,  delay:'0.15s',px:'translate(70px,50px)' },
            { top:'50%', left:'8%',  size:5,  delay:'0.35s',px:'translate(-90px,0px)' },
            { top:'50%', left:'92%', size:5,  delay:'0.25s',px:'translate(90px,0px)' },
          ].map((p, i) => (
            <div key={i} style={{
              position:'absolute', top: p.top, left: p.left,
              width: p.size, height: p.size, borderRadius:'50%',
              background:'#67e8f9', boxShadow:'0 0 6px #22d3ee',
              '--px': p.px,
              animationDelay: p.delay,
              animation: `bmParticle 1.8s ease-out ${p.delay} both`,
            } as React.CSSProperties}/>
          ))}

          {/* 波紋エフェクト（中央から広がる3重リング） */}
          <div style={{position:'absolute',top:'50%',left:'50%',width:180,height:180,borderRadius:'50%',border:'2px solid rgba(103,232,249,0.7)',boxShadow:'0 0 12px rgba(34,211,238,0.5)'}} className="bm-ripple"/>
          <div style={{position:'absolute',top:'50%',left:'50%',width:180,height:180,borderRadius:'50%',border:'2px solid rgba(103,232,249,0.5)',boxShadow:'0 0 12px rgba(34,211,238,0.3)'}} className="bm-ripple2"/>
          <div style={{position:'absolute',top:'50%',left:'50%',width:180,height:180,borderRadius:'50%',border:'2px solid rgba(103,232,249,0.3)'}} className="bm-ripple3"/>

          {/* 星型閃光エフェクト */}
          <div style={{
            position:'absolute', top:'50%', left:'50%',
            fontSize:80, lineHeight:1,
            filter:'drop-shadow(0 0 30px rgba(103,232,249,0.9))',
          }} className="bm-star">✦</div>

          {/* 上部バナー */}
          <div className="bm-banner" style={{
            position:'absolute', top:'12%',
            background:'linear-gradient(90deg, rgba(8,145,178,0.15) 0%, rgba(103,232,249,0.25) 50%, rgba(8,145,178,0.15) 100%)',
            border:'1px solid rgba(103,232,249,0.5)',
            borderRadius:12, paddingLeft:32, paddingRight:32,
            paddingTop:8, paddingBottom:8,
            boxShadow:'0 0 20px rgba(34,211,238,0.3)',
          }}>
            <span style={{color:'#a5f3fc', fontWeight:900, fontSize:14, letterSpacing:'0.3em', textTransform:'uppercase'}}>
              ✦ SPECIAL EVENT ✦
            </span>
          </div>

          {/* メインコンテンツ */}
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:20,zIndex:1}}>
            {/* シールドアイコン */}
            <div className="bm-icon" style={{fontSize:96, lineHeight:1}} >
              <span className="bm-shield" style={{display:'inline-block'}}>🛡️</span>
            </div>

            {/* メインテキスト */}
            <div className="bm-main" style={{
              fontSize:36, fontWeight:900, textAlign:'center',
              color:'#e0f7ff',
              letterSpacing:'0.12em',
              textShadow:'0 0 10px #67e8f9, 0 0 28px #22d3ee, 0 0 55px #0891b2',
            }}>
              バリアカード10枚
            </div>

            {/* プレイヤー名 */}
            <div className="bm-sub" style={{
              fontSize:22, fontWeight:700, color:'#ffffff',
              textShadow:'0 2px 8px rgba(0,0,0,0.8)',
              textAlign:'center', maxWidth:280,
            }}>
              {barrierMegaTarget} が獲得！
            </div>

            {/* BARRIER +10 バッジ */}
            <div className="bm-badge" style={{
              background:'linear-gradient(135deg, rgba(8,145,178,0.3) 0%, rgba(103,232,249,0.2) 100%)',
              border:'1.5px solid rgba(103,232,249,0.6)',
              borderRadius:8, padding:'6px 24px',
              fontSize:18, fontWeight:900, letterSpacing:'0.25em',
              color:'#67e8f9',
              boxShadow:'0 0 16px rgba(34,211,238,0.4)',
            }}>
              BARRIER +10
            </div>
          </div>

          {/* 背景の放射光 */}
          <div style={{
            position:'absolute', top:'50%', left:'50%',
            transform:'translate(-50%,-50%)',
            width:320, height:320, borderRadius:'50%',
            background:'radial-gradient(circle, rgba(103,232,249,0.07) 0%, transparent 70%)',
            pointerEvents:'none',
          }}/>
        </div>
      )}

    </div>
  );
};

export default App;

// ===== ErrorBoundary でラップしたAppをエクスポート =====
export const AppWithErrorBoundary = () => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

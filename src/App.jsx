import { useState, useEffect, useRef, useMemo } from 'react';
import confetti from 'canvas-confetti';
import './App.css';
import { students } from './students';
import { playSound } from './SoundManager';

// ヘルパー: ひらがな変換
const toHiragana = (str) => {
  return str.replace(/[\u30a1-\u30f6]/g, function(match) {
    var chr = match.charCodeAt(0) - 0x60;
    return String.fromCharCode(chr);
  });
};

// ランク計算 (通常モード用)
const calculateRank = (totalTime, count) => {
  const avg = totalTime / count;
  if (avg < 1.5) return "S";
  if (avg < 2.2) return "A";
  if (avg < 3.0) return "B";
  return "C";
};

// 称号計算
const getLevelInfo = (totalCorrect) => {
  if (totalCorrect >= 2000) return { title: "🌈 神教師", next: null, color: "#ff00ff" };
  if (totalCorrect >= 1000) return { title: "👑 マスター", next: 2000, color: "#ffd700" };
  if (totalCorrect >= 500) return { title: "🔥 達人", next: 1000, color: "#ff4757" };
  if (totalCorrect >= 200) return { title: "✨ ベテラン", next: 500, color: "#2ed573" };
  if (totalCorrect >= 50) return { title: "🔰 駆け出し", next: 200, color: "#1e90ff" };
  return { title: "🥚 見習い", next: 50, color: "#a4b0be" };
};

const COMBO_LIMIT = 5000; 

function App() {
  const [screen, setScreen] = useState('start');
  
  // 設定読み込み
  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem('class104_muted') === 'true';
  });
  
  const [gameMode, setGameMode] = useState('reading');
  const [inputMethod, setInputMethod] = useState(() => {
    const saved = localStorage.getItem('class104_inputMethod');
    return saved === 'choice' ? 'choice' : 'typing';
  });
  const [targetCount, setTargetCount] = useState(10);
  const [isRandomOrder, setIsRandomOrder] = useState(() => {
    const saved = localStorage.getItem('class104_random');
    return saved !== null ? saved === 'true' : true;
  });
  const [isPractice, setIsPractice] = useState(false);
  
  // モードフラグ
  const [isSuddenDeath, setIsSuddenDeath] = useState(false);
  const [isTimeAttack, setIsTimeAttack] = useState(false);
  
  // ゲーム状態
  const [isGameOver, setIsGameOver] = useState(false); // サドンデス失敗 or 時間切れ
  const [score, setScore] = useState(0); // タイムアタック用スコア
  const [timeLeft, setTimeLeft] = useState(60); // タイムアタック残り時間

  // 累計成績 (レベル用)
  const [totalCorrectCount, setTotalCorrectCount] = useState(() => {
    return Number(localStorage.getItem('class104_totalCorrect')) || 0;
  });

  // 設定保存
  useEffect(() => { localStorage.setItem('class104_muted', isMuted); }, [isMuted]);
  useEffect(() => { localStorage.setItem('class104_inputMethod', inputMethod); }, [inputMethod]);
  useEffect(() => { localStorage.setItem('class104_random', isRandomOrder); }, [isRandomOrder]);
  useEffect(() => { localStorage.setItem('class104_totalCorrect', totalCorrectCount); }, [totalCorrectCount]);

  // カウントダウン & 保留設定
  const [countdown, setCountdown] = useState(null); 
  const [pendingGameSettings, setPendingGameSettings] = useState(null);

  // ゲームプレイ用
  const [questionList, setQuestionList] = useState([]);
  const [currentStudent, setCurrentStudent] = useState(null);
  const [choices, setChoices] = useState([]);
  const [inputVal, setInputVal] = useState('');
  const [completedIds, setCompletedIds] = useState([]);
  
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [isShake, setIsShake] = useState(false);
  const [currentTimeDisplay, setCurrentTimeDisplay] = useState("0.00");
  
  const [feedback, setFeedback] = useState(null);
  const [animKey, setAnimKey] = useState(0);

  const [penaltyTime, setPenaltyTime] = useState(0); 
  const [questionStartTime, setQuestionStartTime] = useState(0); 
  const [questionStats, setQuestionStats] = useState([]); 

  // コンボ・ランク・新記録・ミス回数
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [comboGauge, setComboGauge] = useState(0); 
  const [rankResult, setRankResult] = useState(null);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [mistakeCount, setMistakeCount] = useState(0);

  // ランキング
  const [ranking, setRanking] = useState(() => {
    const saved = localStorage.getItem('class104_ranking_v3');
    return saved ? JSON.parse(saved) : [];
  });
  const [rankingTab, setRankingTab] = useState('10-reading');

  // 個人成績データ
  const [studentStats, setStudentStats] = useState(() => {
    const saved = localStorage.getItem('class104_stats');
    return saved ? JSON.parse(saved) : {};
  });

  // レベル情報取得
  const levelInfo = getLevelInfo(totalCorrectCount);

  // マスタリーマップ
  const masteryColors = useMemo(() => {
    const validStudents = students
      .filter(s => s.id !== 37 && studentStats[s.id] && studentStats[s.id].count > 0)
      .map(s => ({
        id: s.id,
        avg: studentStats[s.id].totalTime / studentStats[s.id].count
      }));

    validStudents.sort((a, b) => a.avg - b.avg);
    const colors = {};
    const total = validStudents.length;
    validStudents.forEach((s, index) => {
      if (index < total / 3) colors[s.id] = 'master-s'; 
      else if (index < (total * 2) / 3) colors[s.id] = 'master-a'; 
      else colors[s.id] = 'master-b'; 
    });
    return colors;
  }, [studentStats]);

  const [practiceRange, setPracticeRange] = useState({ start: 1, end: 37 });
  const [practiceSelectIds, setPracticeSelectIds] = useState([]);
  const [practiceType, setPracticeType] = useState('range');

  const inputRef = useRef(null);

  const triggerVibrate = (pattern) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  };

  // 問題切り替え時の入力クリア
  useEffect(() => {
    setInputVal('');
    if (inputRef.current) inputRef.current.focus();
  }, [currentStudent]);

  // タイマー制御 (通常モード: カウントアップ / タイムアタック: カウントダウン)
  useEffect(() => {
    let interval;
    if (screen === 'game' && startTime && !endTime && countdown === null) {
      interval = setInterval(() => {
        const now = Date.now();
        
        if (isTimeAttack) {
          // タイムアタック: カウントダウン
          const elapsed = (now - startTime) / 1000;
          // ペナルティタイムは「パス」の時だけ加算される（残り時間が減る）
          const remain = Math.max(0, 60 - elapsed - penaltyTime); 
          setTimeLeft(remain);
          if (remain <= 0) {
            triggerGameOver(true); // 時間切れ
          }
        } else {
          // 通常: カウントアップ
          const diff = (now - startTime) / 1000 + penaltyTime;
          setCurrentTimeDisplay(diff.toFixed(2));
        }
      }, 50);
    }
    return () => clearInterval(interval);
  }, [screen, startTime, endTime, penaltyTime, countdown, isTimeAttack]);

  // コンボゲージ
  useEffect(() => {
    let interval;
    if (screen === 'game' && combo > 0 && !endTime) {
      interval = setInterval(() => {
        setComboGauge(prev => {
          if (prev <= 100) {
            setCombo(0); 
            return 0;
          }
          return prev - 100; 
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [screen, combo, endTime]);

  // カウントダウン
  useEffect(() => {
    let timer;
    if (countdown !== null && countdown > 0) {
      timer = setTimeout(() => {
        setCountdown(countdown - 1);
        if (countdown - 1 > 0) {
          playSoundSafe('dummy'); 
          triggerVibrate(10);
        }
      }, 1000); 
    } else if (countdown === 0) {
      playSoundSafe('dummy'); 
      triggerVibrate(30);
      setCountdown(null);
      startRealGame();
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  // 4択生成
  useEffect(() => {
    if (screen === 'game' && currentStudent && inputMethod === 'choice' && gameMode !== 'seat') {
      generateChoicesForStudent(currentStudent);
    }
  }, [currentStudent, screen, inputMethod, gameMode]);

  const playSoundSafe = (type) => {
    if (!isMuted) playSound(type);
  };

  const generateChoicesForStudent = (student) => {
    let correctText = "";
    if (gameMode === 'id') correctText = student.id.toString();
    else if (gameMode === 'name') correctText = student.name;
    else correctText = student.reading;

    let pool = students.filter(s => s.id !== student.id);
    if (gameMode === 'id') pool = pool.filter(s => s.id !== 37);

    pool.sort(() => Math.random() - 0.5);
    const decoys = pool.slice(0, 3).map(s => {
      if (gameMode === 'id') return s.id.toString();
      if (gameMode === 'name') return s.name;
      return s.reading;
    });

    const mixed = [correctText, ...decoys].sort(() => Math.random() - 0.5);
    setChoices(mixed);
  };

  // --- ゲーム開始設定 ---
  const startNormalGame = (mode, count) => {
    const method = mode === 'seat' ? 'seat' : inputMethod;
    setPendingGameSettings({ 
      targetStudents: students, mode, count, random: true, practice: false, 
      method, suddenDeath: false, timeAttack: false 
    });
    startCountdown();
  };

  const startSuddenDeathGame = (mode) => {
    const method = mode === 'seat' ? 'seat' : inputMethod;
    setPendingGameSettings({ 
      targetStudents: students, mode, count: 37, random: true, practice: false, 
      method, suddenDeath: true, timeAttack: false
    });
    startCountdown();
  };

  const startTimeAttackGame = (mode) => {
    const method = mode === 'seat' ? 'seat' : inputMethod;
    setPendingGameSettings({ 
      targetStudents: students, mode, count: 9999, // 無限
      random: true, practice: false, 
      method, suddenDeath: false, timeAttack: true 
    });
    startCountdown();
  };

  const executePracticeStart = (mode) => {
    let targets = practiceType === 'range' 
      ? students.filter(s => s.id >= practiceRange.start && s.id <= practiceRange.end)
      : students.filter(s => practiceSelectIds.includes(s.id));
    if(targets.length === 0) return alert("生徒を選んでください");
    const method = mode === 'seat' ? 'seat' : inputMethod;
    setPendingGameSettings({ 
      targetStudents: targets, mode, count: targets.length, random: isRandomOrder, practice: true, 
      method, suddenDeath: false, timeAttack: false 
    });
    startCountdown();
  }

  const startReviewGame = () => {
    const weakList = getWeaknessList().map(item => item.student);
    if (weakList.length === 0) return;
    const method = gameMode === 'seat' ? 'seat' : inputMethod;
    setPendingGameSettings({ 
      targetStudents: weakList, mode: gameMode, count: weakList.length, random: true, practice: true, 
      method, suddenDeath: false, timeAttack: false
    });
    startCountdown();
  };

  const startCountdown = () => {
    setScreen('countdown');
    setCountdown(3);
    playSoundSafe('dummy');
    triggerVibrate(10);
  };

  const startRealGame = () => {
    const { targetStudents, mode, count, random, practice, method, suddenDeath, timeAttack } = pendingGameSettings;
    setGameMode(mode);
    setTargetCount(count);
    setIsRandomOrder(random);
    setIsPractice(practice);
    setInputMethod(method);
    setIsSuddenDeath(!!suddenDeath);
    setIsTimeAttack(!!timeAttack);
    setIsGameOver(false);
    
    // リスト作成
    let list = [...targetStudents];
    if (mode === 'id' || mode === 'seat') list = list.filter(s => s.id !== 37);
    if (list.length === 0) { alert("出題対象がいません"); setScreen('start'); return; }

    if (random || timeAttack) list.sort(() => Math.random() - 0.5);
    else list.sort((a, b) => a.id - b.id);

    setQuestionList(list);
    setCompletedIds([]);
    setEndTime(null);
    setInputVal('');
    setCurrentTimeDisplay("0.00");
    setPenaltyTime(0); 
    setQuestionStats([]); 
    
    setCombo(0);
    setMaxCombo(0);
    setComboGauge(0);
    setRankResult(null);
    setFeedback(null);
    setIsNewRecord(false);
    setMistakeCount(0);
    setScore(0); // タイムアタック用
    setTimeLeft(60); // タイムアタック用

    setScreen('game');
    const now = Date.now();
    setStartTime(now);
    setQuestionStartTime(now); 
    setCurrentStudent(list[0]);
    setAnimKey(prev => prev + 1);
  };

  const nextQuestion = (newCompletedIds) => {
    if (isTimeAttack) {
      // タイムアタック：無限ループ（ランダムに次を選ぶ）
      let nextStudent = currentStudent;
      while (nextStudent.id === currentStudent.id) {
        nextStudent = questionList[Math.floor(Math.random() * questionList.length)];
      }
      setCurrentStudent(nextStudent);
      setQuestionStartTime(Date.now());
      setAnimKey(prev => prev + 1);
      return;
    }

    // 通常モード
    if (newCompletedIds.length >= targetCount || newCompletedIds.length >= questionList.length) {
      finishGame();
      return;
    }
    const nextIndex = newCompletedIds.length;
    setCurrentStudent(questionList[nextIndex]);
    setQuestionStartTime(Date.now()); 
    setAnimKey(prev => prev + 1);
  };

  const triggerGameOver = (isTimeout = false) => {
    const end = Date.now();
    setEndTime(end);
    setIsGameOver(true);
    setScreen('result');
    if (!isTimeout) playSoundSafe('dummy'); 
    triggerVibrate([50, 100, 50, 100, 50]); 
  };

  const handlePass = () => {
    if (!currentStudent) return;
    
    if (isSuddenDeath) { triggerGameOver(); return; }
    if (isTimeAttack) {
      // パスはタイムアタックでもペナルティあり (-5秒)
      setPenaltyTime(prev => prev + 5); 
      playSoundSafe('dummy');
      nextQuestion(completedIds); 
      return;
    }

    playSoundSafe('dummy'); 
    triggerVibrate(15);
    setCombo(0); 
    setMistakeCount(prev => prev + 1);
    
    const timeTaken = (Date.now() - questionStartTime) / 1000;
    setQuestionStats([...questionStats, { student: currentStudent, time: timeTaken + 5, isPass: true }]); 
    setPenaltyTime(prev => prev + 5); 
    const newCompletedIds = [...completedIds, currentStudent.id]; 
    setCompletedIds(newCompletedIds);
    setInputVal('');
    nextQuestion(newCompletedIds);
  };

  const quitGame = () => {
    setScreen('start');
    setEndTime(null);
    setCountdown(null);
  };

  const retryGame = () => {
    if(confirm("最初からやり直しますか？")) {
      startCountdown(); 
    }
  };

  const finishGame = () => {
    const end = Date.now();
    setEndTime(end);
    setCurrentStudent(null);
    setScreen('result');
    playSoundSafe('clear');

    const finalTime = (end - startTime) / 1000 + penaltyTime;
    setCurrentTimeDisplay(finalTime.toFixed(2));
    
    const r = calculateRank(finalTime, targetCount);
    setRankResult(r);

    if (isPractice) {
      triggerConfetti(false);
      return;
    }

    // 記録保存（通常モードのみ）
    if (!isTimeAttack) {
      const currentBestRecord = ranking
        .filter(rec => rec.mode === gameMode && rec.count === targetCount)
        .sort((a, b) => a.time - b.time)[0];

      const isNewBest = !currentBestRecord || finalTime < currentBestRecord.time;
      setIsNewRecord(isNewBest);

      const isPerfect = mistakeCount === 0;
      if (isNewBest || isPerfect) triggerConfetti(true);
      else triggerConfetti(false);

      const newRecord = {
        date: new Date().toLocaleDateString(),
        time: finalTime,
        mode: gameMode,
        count: targetCount
      };
      const newRanking = [...ranking, newRecord].sort((a, b) => a.time - b.time); 
      setRanking(newRanking);
      localStorage.setItem('class104_ranking_v3', JSON.stringify(newRanking));
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputVal(val);
    setIsShake(false);
    if (!currentStudent) return;
    checkAnswer(val, false);
  };

  const handleChoiceClick = (val) => {
    triggerVibrate(5);
    checkAnswer(val, true);
  };

  const handleSeatClick = (seatId) => {
    triggerVibrate(5);
    checkAnswer(seatId.toString(), true);
  };

  const showFeedback = (type) => {
    setFeedback(type);
    setTimeout(() => { setFeedback(null); }, 400); 
  };

  const updateStats = (studentId, timeTaken) => {
    setStudentStats(prevStats => {
      const current = prevStats[studentId] || { totalTime: 0, count: 0 };
      const newStats = {
        ...prevStats,
        [studentId]: {
          totalTime: current.totalTime + timeTaken,
          count: current.count + 1
        }
      };
      localStorage.setItem('class104_stats', JSON.stringify(newStats));
      return newStats;
    });
  };

  const checkAnswer = (val, isButton) => {
    let isCorrect = false;
    let isPartialMatch = false;

    let targetRaw = "";
    if (gameMode === 'id' || gameMode === 'seat') targetRaw = currentStudent.id.toString();
    else if (gameMode === 'name') targetRaw = currentStudent.name;
    else targetRaw = currentStudent.reading;
    
    const cleanTarget = targetRaw.replace(/\s+/g, '');
    let cleanVal = val.replace(/\s+/g, '');
    if (gameMode === 'reading' && !isButton) cleanVal = toHiragana(val).replace(/\s+/g, ''); 

    if (cleanVal === cleanTarget) isCorrect = true;
    else {
      if (!isButton && cleanTarget.startsWith(cleanVal) && cleanVal.length > 0) isPartialMatch = true;
    }

    if (isCorrect) {
      // 正解処理
      playSoundSafe('correct');
      showFeedback('correct');
      triggerVibrate(15);

      const newCombo = combo + 1;
      setCombo(newCombo);
      if (newCombo > maxCombo) setMaxCombo(newCombo);
      setComboGauge(COMBO_LIMIT);

      // レベル用カウントアップ
      if (!isPractice) {
        setTotalCorrectCount(prev => prev + 1);
      }

      if (isTimeAttack) {
        // タイムアタック専用処理
        setScore(prev => prev + 1);
        // ★修正：正解ボーナスなし（純粋な60秒）
        // setPenaltyTime(prev => prev - 2); 
        
        nextQuestion([]);
      } else {
        // 通常モード
        const timeTaken = (Date.now() - questionStartTime) / 1000;
        setQuestionStats([...questionStats, { student: currentStudent, time: timeTaken, isPass: false }]);
        if (!isPractice) updateStats(currentStudent.id, timeTaken);

        const newCompletedIds = [...completedIds, currentStudent.id];
        setCompletedIds(newCompletedIds);
        nextQuestion(newCompletedIds);
      }

    } else {
      // 不正解処理
      if (!isPartialMatch) {
        if (isButton || val.length > 0) {
          
          if (isSuddenDeath) { triggerGameOver(); return; }
          
          if (isTimeAttack) {
            // ★修正：タイムアタックでのミスはペナルティなし（振動と音のみ）
            // setPenaltyTime(prev => prev + 5); 
            setIsShake(true);
            playSoundSafe('dummy');
            return;
          }

          setIsShake(true);
          setMistakeCount(prev => prev + 1);
          if (isButton) {
            playSoundSafe('dummy');
            showFeedback('wrong');
            triggerVibrate([30, 50, 30]);
          }
        }
      }
    }
  };

  const triggerConfetti = (isMassive = false) => {
    if(!isMuted) playSoundSafe('clear'); 
    if (isMassive) {
      const end = Date.now() + 3000;
      (function frame() {
        confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#ff0', '#f00', '#0f0', '#00f'] });
        confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#ff0', '#f00', '#0f0', '#00f'] });
        if (Date.now() < end) requestAnimationFrame(frame);
      }());
    } else {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
  };

  const shareResult = (platform) => {
    if (isGameOver && isSuddenDeath) return; 

    let text = "";
    const modeStr = gameMode === 'reading' ? 'ひらがな' : gameMode === 'name' ? '漢字' : gameMode === 'id' ? '番号' : '座席';
    
    if (isTimeAttack) {
      text = `⏱️ 104名前当て タイムアタック(${modeStr})で ${score}人 正解！`;
    } else {
      const typeStr = isSuddenDeath ? 'サドンデス' : isPractice ? '練習' : `${targetCount}人モード`;
      const rankStr = rankResult ? `【ランク${rankResult}】` : '';
      text = `🎉 104名前当て ${typeStr}(${modeStr})を${currentTimeDisplay}秒でクリア！${rankStr}`;
    }
    
    const url = window.location.href;
    if (platform === 'line') window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text + '\n' + url)}`, '_blank');
    if (platform === 'x') window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
  };

  const getFilteredRanking = () => {
    const [rCount, rMode] = rankingTab.split('-');
    const countNum = parseInt(rCount);
    return ranking.filter(r => r.count === countNum && r.mode === rMode).slice(0, 5);
  };

  const getWeaknessList = () => {
    return [...questionStats].sort((a, b) => b.time - a.time).slice(0, 3);
  };

  const resetRanking = () => {
    if (confirm("ランキング履歴をすべて削除しますか？")) {
      localStorage.removeItem('class104_ranking_v3');
      localStorage.removeItem('class104_stats'); 
      setRanking([]);
      setStudentStats({});
      playSoundSafe('dummy'); 
    }
  };

  const isTeacher = (id) => id === 37;

  const getQuestionText = () => {
    if (!currentStudent) return "";
    if (gameMode === 'id' || gameMode === 'seat') return isTeacher(currentStudent.id) ? "Teacher" : currentStudent.name;
    return isTeacher(currentStudent.id) ? "Teacher" : `${currentStudent.id}番`;
  };

  const getPlaceholder = () => {
    if (gameMode === 'id') return "番号を入力";
    if (gameMode === 'name') return "漢字";
    return "ひらがな";
  };

  const getMasteryClass = (id) => { if (masteryColors[id]) return masteryColors[id]; return 'master-n'; };
  const getMasteryTime = (id) => {
    const stat = studentStats[id];
    if (!stat || stat.count === 0) return '-';
    return (stat.totalTime / stat.count).toFixed(1) + 's';
  };

  return (
    <div className="container">
      {feedback && (
        <div className="feedback-overlay">
          <div className={`feedback-icon ${feedback}`}>
            {feedback === 'correct' ? '⭕' : '❌'}
          </div>
        </div>
      )}

      <button className="mute-button" onClick={() => setIsMuted(!isMuted)}>
        {isMuted ? "🔇" : "🔊"}
      </button>

      <h1>104 名前当て</h1>

      {screen === 'start' && (
        <div className="start-screen fade-in">
          <div className="level-card" style={{borderColor: levelInfo.color}}>
            <div className="level-title" style={{color: levelInfo.color}}>{levelInfo.title}</div>
            <div className="level-info">累計正解: {totalCorrectCount}回</div>
            {levelInfo.next && <div className="level-next">次のランクまで: {levelInfo.next - totalCorrectCount}回</div>}
          </div>

          <div className="input-mode-switch">
            <span className="switch-label">入力方法:</span>
            <div className="switch-body">
              <button className={inputMethod === 'typing' ? 'active' : ''} onClick={()=>setInputMethod('typing')}>⌨️ キーボード</button>
              <button className={inputMethod === 'choice' ? 'active' : ''} onClick={()=>setInputMethod('choice')}>🔘 4択ボタン</button>
            </div>
          </div>

          <div className="menu-buttons">
            <div className="section-group">
              <h3>⚡️ サクッと (10問)</h3>
              <div className="button-row four-cols">
                <button onClick={() => startNormalGame('reading', 10)} className="btn-primary">ひらがな</button>
                <button onClick={() => startNormalGame('name', 10)} className="btn-secondary">漢字</button>
                <button onClick={() => startNormalGame('id', 10)} className="btn-outline">番号</button>
                <button onClick={() => startNormalGame('seat', 10)} className="btn-outline">座席</button>
              </div>
            </div>

            <div className="section-group">
              <h3>🔥 全員 (37問)</h3>
              <div className="button-row four-cols">
                <button onClick={() => startNormalGame('reading', 37)} className="btn-primary">ひらがな</button>
                <button onClick={() => startNormalGame('name', 37)} className="btn-secondary">漢字</button>
                <button onClick={() => startNormalGame('id', 37)} className="btn-outline">番号</button>
                <button onClick={() => startNormalGame('seat', 37)} className="btn-outline">座席</button>
              </div>
            </div>

            <div className="section-group">
              <h3 style={{color:'#d63031'}}>💀 サドンデス (一発退場)</h3>
              <div className="button-row four-cols">
                <button onClick={() => startSuddenDeathGame('reading')} className="btn-danger">ひらがな</button>
                <button onClick={() => startSuddenDeathGame('name')} className="btn-danger">漢字</button>
                <button onClick={() => startSuddenDeathGame('id')} className="btn-danger-outline">番号</button>
                <button onClick={() => startSuddenDeathGame('seat')} className="btn-danger-outline">座席</button>
              </div>
            </div>

            <div className="section-group">
              <h3 style={{color:'#0984e3'}}>⏱️ タイムアタック (60秒)</h3>
              <div className="button-row four-cols">
                <button onClick={() => startTimeAttackGame('reading')} className="btn-timeattack">ひらがな</button>
                <button onClick={() => startTimeAttackGame('name')} className="btn-timeattack">漢字</button>
                <button onClick={() => startTimeAttackGame('id')} className="btn-timeattack-outline">番号</button>
                <button onClick={() => startTimeAttackGame('seat')} className="btn-timeattack-outline">座席</button>
              </div>
            </div>

            <div className="sub-menu-row">
              <button onClick={() => { setIsPractice(true); setScreen('practice'); }} className="btn-outline">🔰 練習・カスタム</button>
              <button onClick={() => setScreen('roster')} className="btn-outline">📊 成績リスト</button>
            </div>
          </div>

          <div className="ranking-area">
            <div className="ranking-header">
              <select className="ranking-dropdown" value={rankingTab} onChange={(e) => setRankingTab(e.target.value)}>
                <option value="10-reading">⚡️ 10問 - ひらがな</option>
                <option value="10-name">⚡️ 10問 - 漢字</option>
                <option value="10-id">⚡️ 10問 - 番号</option>
                <option value="10-seat">⚡️ 10問 - 座席</option>
                <option value="37-reading">🔥 全員 - ひらがな</option>
                <option value="37-name">🔥 全員 - 漢字</option>
                <option value="37-id">🔥 全員 - 番号</option>
                <option value="37-seat">🔥 全員 - 座席</option>
              </select>
            </div>
            <ul className="ranking-list">
              {getFilteredRanking().length === 0 && <li className="no-data">記録なし</li>}
              {getFilteredRanking().map((r, i) => (
                <li key={i} className={i === 0 ? 'rank-1' : ''}>
                  <span className="rank-num">{i + 1}</span>
                  <span className="rank-time">{r.time.toFixed(2)}s</span>
                  <span className="rank-date">{r.date.slice(5)}</span>
                </li>
              ))}
            </ul>
            {ranking.length > 0 && <button onClick={resetRanking} className="reset-rank-btn">🗑 履歴を削除</button>}
          </div>
        </div>
      )}

      {screen === 'countdown' && (
        <div className="countdown-overlay fade-in">
          <div className="countdown-number" key={countdown}>
            {countdown > 0 ? countdown : "GO!"}
          </div>
        </div>
      )}

      {screen === 'roster' && (
        <div className="roster-screen fade-in">
          <h2>成績リスト</h2>
          <p style={{fontSize: '0.8rem', color: 'var(--text-sub)', marginBottom: '0.5rem'}}>平均タイム: <span className="legend s">■速い</span> <span className="legend a">■普通</span> <span className="legend b">■遅い</span></p>
          <div className="roster-list-container">
            {students.find(s => s.id === 37) && (
              <div className="teacher-header-card">
                <span className="teacher-badge">Teacher</span>
                <span className="teacher-name-large">{students.find(s => s.id === 37).name}</span>
              </div>
            )}
            <div className="roster-list">
              {students.filter(s => s.id !== 37).map((s, index) => (
                <div key={s.id} className={`list-item ${getMasteryClass(s.id)}`} style={{ animationDelay: `${index * 0.02}s` }}>
                  <div className="list-item-left"><span className="list-id">{s.id}</span><span className="list-name">{s.name}</span></div>
                  <span className="list-time">{getMasteryTime(s.id)}</span>
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => setScreen('start')} className="btn-text">戻る</button>
        </div>
      )}

      {screen === 'practice' && (
        <div className="practice-screen fade-in">
          <h2>練習モード設定</h2>
          <div className="practice-option">
            <label>入力方法:</label>
            <div className="toggle-row">
              <button className={inputMethod === 'typing' ? 'active' : ''} onClick={()=>setInputMethod('typing')}>キーボード</button>
              <button className={inputMethod === 'choice' ? 'active' : ''} onClick={()=>setInputMethod('choice')}>4択</button>
            </div>
          </div>
          <div className="practice-option">
            <label>出題順:</label>
            <div className="toggle-row">
              <button className={!isRandomOrder ? 'active' : ''} onClick={()=>setIsRandomOrder(false)}>番号順</button>
              <button className={isRandomOrder ? 'active' : ''} onClick={()=>setIsRandomOrder(true)}>ランダム</button>
            </div>
          </div>
          <div className="practice-option">
            <label>範囲:</label>
            <div className="toggle-row">
              <button className={practiceType === 'range' ? 'active' : ''} onClick={()=>setPracticeType('range')}>番号指定</button>
              <button className={practiceType === 'select' ? 'active' : ''} onClick={()=>setPracticeType('select')}>個別選択</button>
            </div>
          </div>
          {practiceType === 'range' && (
            <div className="range-inputs">
              <input type="number" value={practiceRange.start} onChange={(e)=>setPracticeRange({...practiceRange, start: Number(e.target.value)})} />
              <span>〜</span>
              <input type="number" value={practiceRange.end} onChange={(e)=>setPracticeRange({...practiceRange, end: Number(e.target.value)})} />
            </div>
          )}
          {practiceType === 'select' && (
            <div className="select-list">
              {students.map(s => (
                <label key={s.id} className="checkbox-item">
                  <input type="checkbox" checked={practiceSelectIds.includes(s.id)} onChange={(e) => {
                      if (e.target.checked) setPracticeSelectIds([...practiceSelectIds, s.id]);
                      else setPracticeSelectIds(practiceSelectIds.filter(id => id !== s.id));
                    }} />
                  {isTeacher(s.id) ? "Teacher" : s.id}. {s.name}
                </label>
              ))}
            </div>
          )}
          <div className="button-row four-cols" style={{marginTop: '1rem'}}>
            <button onClick={() => executePracticeStart('reading')} className="btn-primary">ひらがな</button>
            <button onClick={() => executePracticeStart('name')} className="btn-secondary">漢字</button>
            <button onClick={() => executePracticeStart('id')} className="btn-outline">番号</button>
            <button onClick={() => executePracticeStart('seat')} className="btn-outline">座席</button>
          </div>
          <button onClick={() => setScreen('start')} className="btn-text">戻る</button>
        </div>
      )}

      {screen === 'game' && currentStudent && (
        <div className="game-screen fade-in">
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${(completedIds.length / Math.min(targetCount, questionList.length)) * 100}%` }}></div>
          </div>
          <div className="header-info">
             {isTimeAttack 
               ? <span className="score-badge">🏆 SCORE: {score}</span>
               : <span className="progress">残り: {Math.min(targetCount, questionList.length) - completedIds.length} 人</span>
             }
             <div className="combo-container">
               {isSuddenDeath && <span className="sudden-death-badge">💀 SUDDEN DEATH</span>}
               {!isSuddenDeath && combo > 1 && <span className="combo-badge">🔥 {combo} COMBO!</span>}
               {!isSuddenDeath && combo > 0 && <div className="combo-gauge-wrapper"><div className="combo-gauge-fill" style={{ width: `${(comboGauge / COMBO_LIMIT) * 100}%` }}></div></div>}
             </div>
             <span className={`timer-badge ${isTimeAttack && timeLeft <= 10 ? 'urgent' : ''}`}>
               ⏱ {isTimeAttack ? Math.ceil(timeLeft) : currentTimeDisplay}{isTimeAttack ? '' : 's'}
             </span>
          </div>
          
          <div className="question-card-wrapper" key={animKey}>
            <div className="question-card">
              <h2 className={isTeacher(currentStudent.id) && gameMode !== 'id' && gameMode !== 'seat' ? "student-number teacher-mode-text" : "student-number"}>
                {getQuestionText()}
              </h2>
            </div>
          </div>

          {gameMode === 'seat' ? (
            <div className={`game-seat-grid ${isShake ? 'shake' : ''}`}>
              {students.filter(s => s.id !== 37).map((s, index) => {
                const isCompleted = completedIds.includes(s.id);
                return (
                  <button key={s.id} className={`game-seat-item ${isCompleted ? 'completed' : ''}`} style={{ animationDelay: `${index * 0.02}s` }} onClick={() => !isCompleted && handleSeatClick(s.id)} disabled={isCompleted}>
                    {isCompleted ? s.name.split(' ')[0] : s.id}
                  </button>
                )
              })}
            </div>
          ) : inputMethod === 'typing' ? (
            <div className={`input-area ${isShake ? 'shake' : ''}`}>
              <input ref={inputRef} type={gameMode === 'id' ? "tel" : "text"} inputMode={gameMode === 'id' ? "numeric" : "text"} value={inputVal} onChange={handleInputChange} placeholder={getPlaceholder()} autoFocus className={isShake ? 'input-error' : ''} />
            </div>
          ) : (
            <div className={`choice-grid ${isShake ? 'shake' : ''}`}>
              {choices.map((choice, i) => (
                <button key={i} className="choice-btn" onClick={() => handleChoiceClick(choice)}>{choice}</button>
              ))}
            </div>
          )}

          <button onClick={handlePass} className="pass-button">パス {isSuddenDeath ? '(GAMEOVER)' : isTimeAttack ? '(-5秒)' : '(+5秒)'}</button>
          
          <div className="sub-game-menu">
            <button onClick={retryGame} className="icon-btn">🔄 やり直し</button>
            <button onClick={quitGame} className="icon-btn">🏠 タイトル</button>
          </div>
          {isPractice && !isRandomOrder && !isTeacher(currentStudent.id) && <p className="hint">次は {currentStudent.id + 1}番です</p>}
        </div>
      )}

      {screen === 'result' && (
        <div className="result-screen fade-in">
          {isGameOver && (
            <div className="game-over-container">
              <h2 className="game-over-title">
                {isTimeAttack ? "TIME UP!" : "💀 GAME OVER 💀"}
              </h2>
              <p className="game-over-text">
                {isTimeAttack ? `Score: ${score}人` : "サドンデス失敗..."}
              </p>
            </div>
          )}

          {!isGameOver && mistakeCount === 0 && <div className="perfect-badge">👑 PERFECT!! 👑</div>}
          {!isGameOver && isNewRecord && <div className="new-record-badge">✨ NEW RECORD!! ✨</div>}
          
          {!isGameOver && (
            <h2>{rankResult && <span className="rank-badge">RANK {rankResult}</span>} 🎉 CLEAR! 🎉</h2>
          )}

          <p className="sub-title">
            {isTimeAttack ? 'タイムアタック' : isSuddenDeath ? 'サドンデス' : isPractice ? '練習モード' : `${targetCount}人モード`} 
            ({gameMode === 'reading' ? 'ひらがな' : gameMode === 'name' ? '漢字' : gameMode === 'id' ? '番号' : '座席'})
          </p>
          
          {!isGameOver && (
            <div className="result-box">
              <p className="time-label">Time</p>
              <p className="time-display">{currentTimeDisplay} 秒</p>
              {isPractice && <p style={{fontSize:'0.8rem', color:'#999', marginTop:'5px'}}>※練習モードのため記録は保存されません</p>}
            </div>
          )}

          {!isGameOver && !isTimeAttack && getWeaknessList().length > 0 && (
            <div className="weakness-box">
              <h3>🐢 時間がかかった人</h3>
              <ul>
                {getWeaknessList().map((item, i) => (
                  <li key={i}><span className="weakness-name">{isTeacher(item.student.id) ? "Teacher" : item.student.name.split(' ')[0]}</span><span className="weakness-time">{item.isPass ? <span className="pass-tag">パス</span> : `${item.time.toFixed(1)}s`}</span></li>
                ))}
              </ul>
              <button onClick={startReviewGame} className="review-btn">🔄 苦手な{getWeaknessList().length}人を復習する</button>
            </div>
          )}

          <div className="share-area">
            <div className="share-buttons">
              <button onClick={() => shareResult('line')} className="btn-line">LINE</button>
              <button onClick={() => shareResult('x')} className="btn-x">X</button>
            </div>
          </div>
          <div className="retry-buttons">
            <button onClick={() => setScreen('start')} className="btn-primary">トップに戻る</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
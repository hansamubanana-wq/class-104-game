import { useState, useEffect, useRef, useMemo } from 'react'; // ★useMemoを追加
import confetti from 'canvas-confetti';
import './App.css';
import { students } from './students';
import { playSound } from './SoundManager';

// ヘルパー
const toHiragana = (str) => {
  return str.replace(/[\u30a1-\u30f6]/g, function(match) {
    var chr = match.charCodeAt(0) - 0x60;
    return String.fromCharCode(chr);
  });
};

const calculateRank = (totalTime, count) => {
  const avg = totalTime / count;
  if (avg < 1.5) return "S";
  if (avg < 2.2) return "A";
  if (avg < 3.0) return "B";
  return "C";
};

const COMBO_LIMIT = 5000; 

function App() {
  const [screen, setScreen] = useState('start');
  const [isMuted, setIsMuted] = useState(false);
  
  // ゲーム設定
  const [gameMode, setGameMode] = useState('reading');
  const [inputMethod, setInputMethod] = useState('typing');
  const [targetCount, setTargetCount] = useState(10);
  const [isRandomOrder, setIsRandomOrder] = useState(true);
  const [isPractice, setIsPractice] = useState(false);
  
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

  // コンボ・ランク・新記録
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [comboTimeLeft, setComboTimeLeft] = useState(0); 
  const [rankResult, setRankResult] = useState(null);
  const [isNewRecord, setIsNewRecord] = useState(false);

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

  // ★追加：相対評価用の色マップ計算 (useMemoで最適化)
  const masteryColors = useMemo(() => {
    // 1. データがある生徒(先生除く)のリストを作り、平均タイムを計算
    const validStudents = students
      .filter(s => s.id !== 37 && studentStats[s.id] && studentStats[s.id].count > 0)
      .map(s => ({
        id: s.id,
        avg: studentStats[s.id].totalTime / studentStats[s.id].count
      }));

    // 2. タイムが良い順(昇順)にソート
    validStudents.sort((a, b) => a.avg - b.avg);

    // 3. 順位に基づいて色を割り当て
    const colors = {};
    const total = validStudents.length;
    
    validStudents.forEach((s, index) => {
      // 上位 1/3
      if (index < total / 3) {
        colors[s.id] = 'master-s'; // 緑
      } 
      // 中位 1/3 (上位1/3 〜 上位2/3)
      else if (index < (total * 2) / 3) {
        colors[s.id] = 'master-a'; // 黄
      } 
      // 下位 1/3
      else {
        colors[s.id] = 'master-b'; // 赤
      }
    });

    return colors;
  }, [studentStats]); // studentStatsが更新されるたびに再計算

  // 練習モード設定
  const [practiceRange, setPracticeRange] = useState({ start: 1, end: 37 });
  const [practiceSelectIds, setPracticeSelectIds] = useState([]);
  const [practiceType, setPracticeType] = useState('range');

  const inputRef = useRef(null);

  // タイマー
  useEffect(() => {
    let interval;
    if (screen === 'game' && startTime && !endTime && countdown === null) {
      interval = setInterval(() => {
        const now = Date.now();
        const diff = (now - startTime) / 1000 + penaltyTime;
        setCurrentTimeDisplay(diff.toFixed(2));
      }, 50);
    }
    return () => clearInterval(interval);
  }, [screen, startTime, endTime, penaltyTime, countdown]);

  // コンボゲージ
  useEffect(() => {
    let interval;
    if (screen === 'game' && combo > 0 && !endTime) {
      interval = setInterval(() => {
        setComboTimeLeft(prev => {
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
        if (countdown - 1 > 0) playSoundSafe('dummy'); 
      }, 1000); 
    } else if (countdown === 0) {
      playSoundSafe('dummy'); 
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

  // --- ゲーム開始 ---
  const startNormalGame = (mode, count) => {
    const method = mode === 'seat' ? 'seat' : inputMethod;
    setPendingGameSettings({ targetStudents: students, mode, count, random: true, practice: false, method });
    startCountdown();
  };

  const executePracticeStart = (mode) => {
    let targets = practiceType === 'range' 
      ? students.filter(s => s.id >= practiceRange.start && s.id <= practiceRange.end)
      : students.filter(s => practiceSelectIds.includes(s.id));
    
    if(targets.length === 0) return alert("生徒を選んでください");
    
    const method = mode === 'seat' ? 'seat' : inputMethod;
    setPendingGameSettings({ targetStudents: targets, mode, count: targets.length, random: isRandomOrder, practice: true, method });
    startCountdown();
  }

  const startReviewGame = () => {
    const weakList = getWeaknessList().map(item => item.student);
    if (weakList.length === 0) return;

    const method = gameMode === 'seat' ? 'seat' : inputMethod;
    setPendingGameSettings({ 
      targetStudents: weakList, 
      mode: gameMode, 
      count: weakList.length, 
      random: true, 
      practice: true, 
      method 
    });
    startCountdown();
  };

  const startCountdown = () => {
    setScreen('countdown');
    setCountdown(3);
    playSoundSafe('dummy');
  };

  const startRealGame = () => {
    const { targetStudents, mode, count, random, practice, method } = pendingGameSettings;
    setGameMode(mode);
    setTargetCount(count);
    setIsRandomOrder(random);
    setIsPractice(practice);
    setInputMethod(method);
    
    let list = [...targetStudents];
    if (mode === 'id' || mode === 'seat') {
      list = list.filter(s => s.id !== 37);
    }
    if (list.length === 0) {
      alert("出題対象がいません");
      setScreen('start');
      return;
    }

    if (random) list.sort(() => Math.random() - 0.5);
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
    setComboTimeLeft(0);
    setRankResult(null);
    setFeedback(null);
    setIsNewRecord(false);

    setScreen('game');
    const now = Date.now();
    setStartTime(now);
    setQuestionStartTime(now); 
    setCurrentStudent(list[0]);
    setAnimKey(prev => prev + 1);
  };

  const nextQuestion = (newCompletedIds) => {
    if (newCompletedIds.length >= targetCount || newCompletedIds.length >= questionList.length) {
      finishGame();
      return;
    }
    const nextIndex = newCompletedIds.length;
    setCurrentStudent(questionList[nextIndex]);
    setQuestionStartTime(Date.now()); 
    setAnimKey(prev => prev + 1);
  };

  const handlePass = () => {
    if (!currentStudent) return;
    playSoundSafe('dummy'); 
    setCombo(0); 
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

    const currentBestRecord = ranking
      .filter(rec => rec.mode === gameMode && rec.count === targetCount)
      .sort((a, b) => a.time - b.time)[0];

    const isNewBest = !currentBestRecord || finalTime < currentBestRecord.time;
    setIsNewRecord(isNewBest);

    if (isNewBest) {
      triggerConfetti(true);
    } else {
      triggerConfetti(false);
    }

    const newRecord = {
      date: new Date().toLocaleDateString(),
      time: finalTime,
      mode: gameMode,
      count: targetCount
    };
    const newRanking = [...ranking, newRecord].sort((a, b) => a.time - b.time); 
    setRanking(newRanking);
    localStorage.setItem('class104_ranking_v3', JSON.stringify(newRanking));
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputVal(val);
    setIsShake(false);

    if (!currentStudent) return;
    checkAnswer(val, false);
  };

  const handleChoiceClick = (val) => {
    checkAnswer(val, true);
  };

  const handleSeatClick = (seatId) => {
    checkAnswer(seatId.toString(), true);
  };

  const showFeedback = (type) => {
    setFeedback(type);
    setTimeout(() => {
      setFeedback(null);
    }, 400); 
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
    if (gameMode === 'reading' && !isButton) {
      cleanVal = toHiragana(val).replace(/\s+/g, ''); 
    }

    if (cleanVal === cleanTarget) {
      isCorrect = true;
    } else {
      if (!isButton && cleanTarget.startsWith(cleanVal) && cleanVal.length > 0) {
        isPartialMatch = true;
      }
    }

    if (isCorrect) {
      playSoundSafe('correct');
      showFeedback('correct');

      const newCombo = combo + 1;
      setCombo(newCombo);
      if (newCombo > maxCombo) setMaxCombo(newCombo);
      setComboTimeLeft(COMBO_LIMIT);

      const timeTaken = (Date.now() - questionStartTime) / 1000;
      setQuestionStats([...questionStats, { student: currentStudent, time: timeTaken, isPass: false }]);
      
      if (!isPractice) {
        updateStats(currentStudent.id, timeTaken);
      }

      const newCompletedIds = [...completedIds, currentStudent.id];
      setCompletedIds(newCompletedIds);
      setInputVal('');
      
      nextQuestion(newCompletedIds);
    } else {
      if (!isPartialMatch) {
        if (isButton || val.length > 0) {
          setIsShake(true);
          if (isButton) {
            playSoundSafe('dummy');
            showFeedback('wrong');
          }
        }
      }
    }
  };

  const triggerConfetti = (isMassive = false) => {
    if(!isMuted) playSoundSafe('clear'); 
    
    if (isMassive) {
      const duration = 3000;
      const end = Date.now() + duration;
      (function frame() {
        confetti({
          particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#ff0', '#f00', '#0f0', '#00f'] 
        });
        confetti({
          particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#ff0', '#f00', '#0f0', '#00f']
        });
        if (Date.now() < end) requestAnimationFrame(frame);
      }());
    } else {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
  };

  const shareResult = (platform) => {
    const time = currentTimeDisplay;
    let modeStr = 'ひらがな';
    if(gameMode === 'name') modeStr = '漢字';
    if(gameMode === 'id') modeStr = '番号';
    if(gameMode === 'seat') modeStr = '座席';
    
    const typeStr = isPractice ? '練習' : `${targetCount}人モード`;
    const rankStr = rankResult ? `【ランク${rankResult}】` : '';
    const newRecStr = isNewRecord ? '【自己新！】' : '';
    
    const text = `${newRecStr}${rankStr} 104名前当て ${typeStr}(${modeStr})を${time}秒でクリア！ MAXコンボ:${maxCombo}`;
    const url = window.location.href;
    if (platform === 'line') window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text + '\n' + url)}`, '_blank');
    if (platform === 'x') window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
  };

  const getFilteredRanking = () => {
    const [rCount, rMode] = rankingTab.split('-');
    const countNum = parseInt(rCount);
    return ranking
      .filter(r => r.count === countNum && r.mode === rMode)
      .slice(0, 5);
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
    if (gameMode === 'id' || gameMode === 'seat') {
      return isTeacher(currentStudent.id) ? "Teacher" : currentStudent.name;
    }
    return isTeacher(currentStudent.id) ? "Teacher" : `${currentStudent.id}番`;
  };

  const getPlaceholder = () => {
    if (gameMode === 'id') return "番号を入力";
    if (gameMode === 'name') return "漢字";
    return "ひらがな";
  };

  // ★修正：相対評価マップを使ってクラスを返す
  const getMasteryClass = (id) => {
    if (masteryColors[id]) {
      return masteryColors[id];
    }
    return 'master-n'; // データなし
  };

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

            <div className="sub-menu-row">
              <button onClick={() => { setIsPractice(true); setScreen('practice'); }} className="btn-outline">🔰 練習・カスタム</button>
              <button onClick={() => setScreen('roster')} className="btn-outline">📊 座席表・成績</button>
            </div>
          </div>

          <div className="ranking-area">
            <div className="ranking-header">
              <div className="ranking-tabs scrollable-tabs">
                <button className={rankingTab === '10-reading' ? 'active' : ''} onClick={()=>setRankingTab('10-reading')}>10ひ</button>
                <button className={rankingTab === '10-name' ? 'active' : ''} onClick={()=>setRankingTab('10-name')}>10漢</button>
                <button className={rankingTab === '10-id' ? 'active' : ''} onClick={()=>setRankingTab('10-id')}>10番</button>
                <button className={rankingTab === '10-seat' ? 'active' : ''} onClick={()=>setRankingTab('10-seat')}>10席</button>
                <button className={rankingTab === '37-reading' ? 'active' : ''} onClick={()=>setRankingTab('37-reading')}>全ひ</button>
                <button className={rankingTab === '37-name' ? 'active' : ''} onClick={()=>setRankingTab('37-name')}>全漢</button>
                <button className={rankingTab === '37-id' ? 'active' : ''} onClick={()=>setRankingTab('37-id')}>全番</button>
                <button className={rankingTab === '37-seat' ? 'active' : ''} onClick={()=>setRankingTab('37-seat')}>全席</button>
              </div>
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
            {ranking.length > 0 && (
              <button onClick={resetRanking} className="reset-rank-btn">🗑 履歴を削除</button>
            )}
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
          <h2>座席・成績表</h2>
          <p style={{fontSize: '0.8rem', color: '#666', marginBottom: '0.5rem'}}>
            平均タイム: <span style={{color:'#06C755'}}>■速い(上位1/3)</span> <span style={{color:'#f1c40f'}}>■普通</span> <span style={{color:'#e74c3c'}}>■遅い(下位1/3)</span>
          </p>
          <div className="classroom-layout">
            <div className="blackboard-area">
              <div className="blackboard">黒 板</div>
              {students.find(s => s.id === 37) && (
                <div className="teacher-desk">
                  <span className="teacher-label">Teacher</span>
                  <span className="teacher-name">{students.find(s => s.id === 37).name}</span>
                </div>
              )}
            </div>
            
            <div className="desks-grid">
              {students.filter(s => s.id !== 37).map(s => (
                <div key={s.id} className={`desk-item ${getMasteryClass(s.id)}`}>
                  <span className="desk-id">{s.id}</span>
                  <span className="desk-name">{s.name}</span>
                  {/* 平均タイム表示 */}
                  <span className="desk-time">{getMasteryTime(s.id)}</span>
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => setScreen('start')} className="btn-text">戻る</button>
        </div>
      )}

      {/* (省略なしで練習モード) */}
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
                  <input 
                    type="checkbox" 
                    checked={practiceSelectIds.includes(s.id)}
                    onChange={(e) => {
                      if (e.target.checked) setPracticeSelectIds([...practiceSelectIds, s.id]);
                      else setPracticeSelectIds(practiceSelectIds.filter(id => id !== s.id));
                    }}
                  />
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
            <div 
              className="progress-bar-fill" 
              style={{ width: `${(completedIds.length / Math.min(targetCount, questionList.length)) * 100}%` }}
            ></div>
          </div>
          
          <div className="header-info">
             <span className="progress">残り: {Math.min(targetCount, questionList.length) - completedIds.length} 人</span>
             <div className="combo-container">
               {combo > 1 && <span className="combo-badge">🔥 {combo} COMBO!</span>}
               {combo > 0 && (
                 <div className="combo-gauge-wrapper">
                   <div 
                     className="combo-gauge-fill" 
                     style={{ width: `${(comboTimeLeft / COMBO_LIMIT) * 100}%` }}
                   ></div>
                 </div>
               )}
             </div>
             <span className="timer-badge">⏱ {currentTimeDisplay}s</span>
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
              {students.filter(s => s.id !== 37).map(s => {
                const isCompleted = completedIds.includes(s.id);
                return (
                  <button 
                    key={s.id} 
                    className={`game-seat-item ${isCompleted ? 'completed' : ''}`} 
                    onClick={() => !isCompleted && handleSeatClick(s.id)}
                    disabled={isCompleted}
                  >
                    {isCompleted ? s.name.split(' ')[0] : s.id}
                  </button>
                )
              })}
            </div>
          ) : inputMethod === 'typing' ? (
            <div className={`input-area ${isShake ? 'shake' : ''}`}>
              <input
                ref={inputRef}
                type={gameMode === 'id' ? "tel" : "text"} 
                inputMode={gameMode === 'id' ? "numeric" : "text"}
                value={inputVal}
                onChange={handleInputChange}
                placeholder={getPlaceholder()}
                autoFocus
                className={isShake ? 'input-error' : ''}
              />
            </div>
          ) : (
            <div className={`choice-grid ${isShake ? 'shake' : ''}`}>
              {choices.map((choice, i) => (
                <button key={i} className="choice-btn" onClick={() => handleChoiceClick(choice)}>
                  {choice}
                </button>
              ))}
            </div>
          )}

          <button onClick={handlePass} className="pass-button">パス (+5秒)</button>
          
          <div className="sub-game-menu">
            <button onClick={retryGame} className="icon-btn">🔄 やり直し</button>
            <button onClick={quitGame} className="icon-btn">🏠 タイトル</button>
          </div>

          {isPractice && !isRandomOrder && !isTeacher(currentStudent.id) && <p className="hint">次は {currentStudent.id + 1}番です</p>}
        </div>
      )}

      {screen === 'result' && (
        <div className="result-screen fade-in">
          {isNewRecord && <div className="new-record-badge">✨ NEW RECORD!! ✨</div>}
          
          <h2>
             {rankResult && <span className="rank-badge">RANK {rankResult}</span>}
             🎉 CLEAR! 🎉
          </h2>
          <p className="sub-title">
            {isPractice ? '練習モード' : `${targetCount}人モード`} 
            ({gameMode === 'reading' ? 'ひらがな' : gameMode === 'name' ? '漢字' : gameMode === 'id' ? '番号' : '座席'})
          </p>
          
          <div className="result-box">
            <p className="time-label">Time</p>
            <p className="time-display">{currentTimeDisplay} 秒</p>
            {isPractice && <p style={{fontSize:'0.8rem', color:'#999', marginTop:'5px'}}>※練習モードのため記録は保存されません</p>}
          </div>

          {getWeaknessList().length > 0 && (
            <div className="weakness-box">
              <h3>🐢 時間がかかった人</h3>
              <ul>
                {getWeaknessList().map((item, i) => (
                  <li key={i}>
                    <span className="weakness-name">{isTeacher(item.student.id) ? "Teacher" : item.student.name.split(' ')[0]}</span>
                    <span className="weakness-time">
                      {item.isPass ? <span className="pass-tag">パス</span> : `${item.time.toFixed(1)}s`}
                    </span>
                  </li>
                ))}
              </ul>
              <button onClick={startReviewGame} className="review-btn">
                🔄 苦手な{getWeaknessList().length}人を復習する
              </button>
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
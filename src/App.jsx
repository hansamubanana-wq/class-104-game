import { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import './App.css';
import { students } from './students';
import { playSound } from './SoundManager';

// カタカナをひらがなに変換するヘルパー関数
const toHiragana = (str) => {
  return str.replace(/[\u30a1-\u30f6]/g, function(match) {
    var chr = match.charCodeAt(0) - 0x60;
    return String.fromCharCode(chr);
  });
};

function App() {
  const [screen, setScreen] = useState('start');
  const [isMuted, setIsMuted] = useState(false);
  
  // ゲーム設定
  const [gameMode, setGameMode] = useState('reading');
  const [targetCount, setTargetCount] = useState(10);
  const [isRandomOrder, setIsRandomOrder] = useState(true);
  const [isPractice, setIsPractice] = useState(false);
  
  // カウントダウン用
  const [countdown, setCountdown] = useState(null); // null = なし, 3,2,1,0
  const [pendingGameSettings, setPendingGameSettings] = useState(null); // カウントダウン後に開始する設定

  // ゲームプレイ用
  const [questionList, setQuestionList] = useState([]);
  const [currentStudent, setCurrentStudent] = useState(null);
  const [inputVal, setInputVal] = useState('');
  const [completedIds, setCompletedIds] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [isShake, setIsShake] = useState(false);
  const [currentTimeDisplay, setCurrentTimeDisplay] = useState("0.00");
  
  // 新機能用ステート
  const [penaltyTime, setPenaltyTime] = useState(0); // ペナルティ秒数
  const [questionStartTime, setQuestionStartTime] = useState(0); // 1問ごとの開始時間
  const [questionStats, setQuestionStats] = useState([]); // 苦手分析用ログ

  // ランキング (v3)
  const [ranking, setRanking] = useState(() => {
    const saved = localStorage.getItem('class104_ranking_v3');
    return saved ? JSON.parse(saved) : [];
  });
  const [rankingTab, setRankingTab] = useState('10-reading');

  // 練習モード設定
  const [practiceRange, setPracticeRange] = useState({ start: 1, end: 37 });
  const [practiceSelectIds, setPracticeSelectIds] = useState([]);
  const [practiceType, setPracticeType] = useState('range');

  const inputRef = useRef(null);

  // タイマー（ペナルティ考慮）
  useEffect(() => {
    let interval;
    if (screen === 'game' && startTime && !endTime && countdown === null) {
      interval = setInterval(() => {
        const now = Date.now();
        // 経過時間 + ペナルティ
        const diff = (now - startTime) / 1000 + penaltyTime;
        setCurrentTimeDisplay(diff.toFixed(2));
      }, 50);
    }
    return () => clearInterval(interval);
  }, [screen, startTime, endTime, penaltyTime, countdown]);

  // カウントダウン処理
  useEffect(() => {
    let timer;
    if (countdown !== null && countdown > 0) {
      timer = setTimeout(() => {
        setCountdown(countdown - 1);
        if (countdown - 1 > 0) playSoundSafe('dummy'); // ピッ
      }, 1000);
    } else if (countdown === 0) {
      // カウントダウン終了、ゲーム開始
      playSoundSafe('dummy'); // ポーン
      setCountdown(null);
      startRealGame();
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const playSoundSafe = (type) => {
    if (!isMuted) playSound(type);
  };

  // --- ゲーム開始フロー ---
  
  // 1. 設定を受け取ってカウントダウンを開始
  const startNormalGame = (mode, count) => {
    setPendingGameSettings({ targetStudents: students, mode, count, random: true, practice: false });
    startCountdown();
  };

  const executePracticeStart = (mode) => {
    let targets = practiceType === 'range' 
      ? students.filter(s => s.id >= practiceRange.start && s.id <= practiceRange.end)
      : students.filter(s => practiceSelectIds.includes(s.id));
    
    if(targets.length === 0) return alert("生徒を選んでください");
    
    setPendingGameSettings({ targetStudents: targets, mode, count: targets.length, random: isRandomOrder, practice: true });
    startCountdown();
  }

  const startCountdown = () => {
    setScreen('countdown');
    setCountdown(3);
    playSoundSafe('dummy');
  };

  // 2. カウントダウン後に呼ばれる実処理
  const startRealGame = () => {
    const { targetStudents, mode, count, random, practice } = pendingGameSettings;
    
    setGameMode(mode);
    setTargetCount(count);
    setIsRandomOrder(random);
    setIsPractice(practice);
    
    let list = [...targetStudents];
    if (random) {
      list.sort(() => Math.random() - 0.5);
    } else {
      list.sort((a, b) => a.id - b.id);
    }

    setQuestionList(list);
    setCompletedIds([]);
    setEndTime(null);
    setInputVal('');
    setCurrentTimeDisplay("0.00");
    setPenaltyTime(0); // ペナルティリセット
    setQuestionStats([]); // ログリセット
    setScreen('game');
    
    const now = Date.now();
    setStartTime(now);
    setQuestionStartTime(now); // 1問目の計測開始
    setCurrentStudent(list[0]);
  };

  const nextQuestion = (newCompletedIds) => {
    if (newCompletedIds.length >= targetCount) {
      finishGame();
      return;
    }
    const nextIndex = newCompletedIds.length;
    setCurrentStudent(questionList[nextIndex]);
    setQuestionStartTime(Date.now()); // 次の問題の計測開始
  };

  // パス機能
  const handlePass = () => {
    if (!currentStudent) return;
    
    playSoundSafe('dummy'); // パス音（仮）
    
    // 記録（パスはタイム最大扱いやペナルティとして記録してもいいが、ここでは時間を記録）
    const timeTaken = (Date.now() - questionStartTime) / 1000;
    setQuestionStats([...questionStats, { student: currentStudent, time: timeTaken + 5, isPass: true }]); // パスしたことも記録

    setPenaltyTime(prev => prev + 5); // ペナルティ加算
    
    const newCompletedIds = [...completedIds, currentStudent.id]; // 完了扱いにして次へ
    setCompletedIds(newCompletedIds);
    setInputVal('');
    nextQuestion(newCompletedIds);
  };

  const finishGame = () => {
    const end = Date.now();
    setEndTime(end);
    setCurrentStudent(null);
    setScreen('result');
    playSoundSafe('clear');
    triggerConfetti();

    // 最終タイム（ペナルティ込み）
    const finalTime = (end - startTime) / 1000 + penaltyTime;
    setCurrentTimeDisplay(finalTime.toFixed(2));

    if (isPractice) return; 

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

    const targetRaw = gameMode === 'reading' ? currentStudent.reading : currentStudent.name;
    // ★新機能：入力をひらがなに変換してから比較
    const cleanVal = toHiragana(val).replace(/\s+/g, ''); 
    const cleanTarget = targetRaw.replace(/\s+/g, '');

    if (cleanVal === cleanTarget) {
      playSoundSafe('correct');
      
      // ログ記録
      const timeTaken = (Date.now() - questionStartTime) / 1000;
      setQuestionStats([...questionStats, { student: currentStudent, time: timeTaken, isPass: false }]);

      const newCompletedIds = [...completedIds, currentStudent.id];
      setCompletedIds(newCompletedIds);
      setInputVal('');
      nextQuestion(newCompletedIds);
    } else {
      // 入力途中判定もひらがな変換後で行う
      if (!cleanTarget.startsWith(cleanVal) && cleanVal.length > 0) {
        setIsShake(true);
      }
    }
  };

  const triggerConfetti = () => {
    if(!isMuted) playSoundSafe('clear'); 
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  };

  const shareResult = (platform) => {
    const time = currentTimeDisplay;
    const modeStr = gameMode === 'reading' ? 'ひらがな' : '漢字';
    const typeStr = isPractice ? '練習' : `${targetCount}人モード`;
    const text = `【104名前当て】${typeStr}(${modeStr})を${time}秒でクリア！`;
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

  // 苦手リスト取得（時間がかかった上位3名）
  const getWeaknessList = () => {
    // 時間順に降順ソート
    return [...questionStats]
      .sort((a, b) => b.time - a.time)
      .slice(0, 3);
  };

  const resetRanking = () => {
    if (confirm("ランキング履歴をすべて削除しますか？")) {
      localStorage.removeItem('class104_ranking_v3');
      setRanking([]);
      playSoundSafe('dummy'); 
    }
  };

  const isTeacher = (id) => id === 37;

  return (
    <div className="container">
      <button 
        className="mute-button" 
        onClick={() => setIsMuted(!isMuted)}
        title={isMuted ? "音声をオンにする" : "音声をオフにする"}
      >
        {isMuted ? "🔇" : "🔊"}
      </button>

      <h1>104 名前当て</h1>

      {screen === 'start' && (
        <div className="start-screen fade-in">
          <div className="menu-buttons">
            <div className="section-group">
              <h3>⚡️ サクッと (10問)</h3>
              <div className="button-row">
                <button onClick={() => startNormalGame('reading', 10)} className="btn-primary">ひらがな</button>
                <button onClick={() => startNormalGame('name', 10)} className="btn-secondary">漢字</button>
              </div>
            </div>

            <div className="section-group">
              <h3>🔥 全員 (37問)</h3>
              <div className="button-row">
                <button onClick={() => startNormalGame('reading', 37)} className="btn-primary">ひらがな</button>
                <button onClick={() => startNormalGame('name', 37)} className="btn-secondary">漢字</button>
              </div>
            </div>

            <div className="sub-menu-row">
              <button onClick={() => { setIsPractice(true); setScreen('practice'); }} className="btn-outline">🔰 練習・カスタム</button>
              <button onClick={() => setScreen('roster')} className="btn-outline">📖 名簿を見る</button>
            </div>
          </div>

          <div className="ranking-area">
            <div className="ranking-header">
              <div className="ranking-tabs">
                <button className={rankingTab === '10-reading' ? 'active' : ''} onClick={()=>setRankingTab('10-reading')}>10ひ</button>
                <button className={rankingTab === '10-name' ? 'active' : ''} onClick={()=>setRankingTab('10-name')}>10漢</button>
                <button className={rankingTab === '37-reading' ? 'active' : ''} onClick={()=>setRankingTab('37-reading')}>全ひ</button>
                <button className={rankingTab === '37-name' ? 'active' : ''} onClick={()=>setRankingTab('37-name')}>全漢</button>
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

      {/* カウントダウン画面 */}
      {screen === 'countdown' && (
        <div className="countdown-overlay fade-in">
          <div className="countdown-number">
            {countdown > 0 ? countdown : "GO!"}
          </div>
        </div>
      )}

      {screen === 'roster' && (
        <div className="roster-screen fade-in">
          <h2>座席表</h2>
          <div className="classroom-layout">
            <div className="blackboard-area">
              <div className="blackboard">黒 板</div>
              {students.find(s => s.id === 37) && (
                <div className="teacher-desk">
                  <span className="teacher-label">Teacher</span>
                  <span className="teacher-name">{students.find(s => s.id === 37).name}</span>
                  <span className="teacher-reading">{students.find(s => s.id === 37).reading}</span>
                </div>
              )}
            </div>
            
            <div className="desks-grid">
              {students.filter(s => s.id !== 37).map(s => (
                <div key={s.id} className="desk-item">
                  <span className="desk-id">{s.id}</span>
                  <span className="desk-name">{s.name}</span>
                  <span className="desk-reading">{s.reading}</span>
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
          <div className="button-row" style={{marginTop: '1rem'}}>
            <button onClick={() => executePracticeStart('reading')} className="btn-primary">ひらがな</button>
            <button onClick={() => executePracticeStart('name')} className="btn-secondary">漢字</button>
          </div>
          <button onClick={() => setScreen('start')} className="btn-text">戻る</button>
        </div>
      )}

      {screen === 'game' && currentStudent && (
        <div className="game-screen fade-in">
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${(completedIds.length / targetCount) * 100}%` }}></div>
          </div>
          
          <div className="header-info">
             <span className="progress">残り: {targetCount - completedIds.length} 人</span>
             <span className="timer-badge">⏱ {currentTimeDisplay}s</span>
          </div>
          
          <div className="question-card">
            <h2 className={isTeacher(currentStudent.id) ? "student-number teacher-mode-text" : "student-number"}>
              {isTeacher(currentStudent.id) ? "Teacher" : `${currentStudent.id}番`}
            </h2>
          </div>

          <div className={`input-area ${isShake ? 'shake' : ''}`}>
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={handleInputChange}
              placeholder={gameMode === 'reading' ? "ひらがな" : "漢字"}
              autoFocus
              className={isShake ? 'input-error' : ''}
            />
          </div>
          {/* パスボタン */}
          <button onClick={handlePass} className="pass-button">パス (+5秒)</button>
          
          {isPractice && !isRandomOrder && !isTeacher(currentStudent.id) && <p className="hint">次は {currentStudent.id + 1}番です</p>}
        </div>
      )}

      {screen === 'result' && (
        <div className="result-screen fade-in">
          <h2>🎉 CLEAR! 🎉</h2>
          <p className="sub-title">{isPractice ? '練習モード' : `${targetCount}人モード`} ({gameMode === 'reading' ? 'ひらがな' : '漢字'})</p>
          
          <div className="result-box">
            <p className="time-label">Time</p>
            <p className="time-display">{currentTimeDisplay} 秒</p>
            {isPractice && <p style={{fontSize:'0.8rem', color:'#999', marginTop:'5px'}}>※練習モードのため記録は保存されません</p>}
          </div>

          {/* 苦手リスト表示 */}
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
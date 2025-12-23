import { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti'; // 紙吹雪用
import './App.css';
import { students } from './students';
import { playSound } from './SoundManager';

function App() {
  const [gameMode, setGameMode] = useState('reading');
  const [targetCount, setTargetCount] = useState(10);
  const [currentStudent, setCurrentStudent] = useState(null);
  const [inputVal, setInputVal] = useState('');
  const [completedIds, setCompletedIds] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [isShake, setIsShake] = useState(false); // 揺れアニメーション用

  // ランキング読み込み
  const [ranking, setRanking] = useState(() => {
    const saved = localStorage.getItem('class104_ranking_v2');
    return saved ? JSON.parse(saved) : [];
  });

  const inputRef = useRef(null);

  // ゲーム開始
  const startGame = (mode, count) => {
    playSound('dummy'); 
    setGameMode(mode);
    setTargetCount(count);
    setCompletedIds([]);
    setEndTime(null);
    setInputVal('');
    setIsGameStarted(true);
    setStartTime(Date.now());
    pickNextStudent([], count);
  };

  const pickNextStudent = (doneIds, countLimit) => {
    if (doneIds.length >= countLimit) {
      finishGame();
      return;
    }
    const remainingStudents = students.filter(s => !doneIds.includes(s.id));
    if (remainingStudents.length === 0) {
      finishGame();
      return;
    }
    const randomIndex = Math.floor(Math.random() * remainingStudents.length);
    setCurrentStudent(remainingStudents[randomIndex]);
  };

  // ゲーム終了（紙吹雪発動！）
  const finishGame = () => {
    const end = Date.now();
    setEndTime(end);
    setCurrentStudent(null);
    playSound('clear');
    
    // 紙吹雪エフェクト
    triggerConfetti();

    const currentTime = (end - startTime) / 1000;
    const newRecord = {
      date: new Date().toLocaleDateString(),
      time: currentTime,
      mode: gameMode,
      count: targetCount
    };
    const newRanking = [...ranking, newRecord].sort((a, b) => a.time - b.time).slice(0, 10);
    setRanking(newRanking);
    localStorage.setItem('class104_ranking_v2', JSON.stringify(newRanking));
  };

  // 紙吹雪の設定
  const triggerConfetti = () => {
    const duration = 3000;
    const end = Date.now() + duration;

    (function frame() {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#ff6b6b', '#4a90e2', '#f6d365']
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#ff6b6b', '#4a90e2', '#f6d365']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  };

  // 入力判定（間違い判定を追加）
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputVal(val);
    
    // 揺れをリセット
    setIsShake(false);

    if (!currentStudent) return;

    const targetRaw = gameMode === 'reading' ? currentStudent.reading : currentStudent.name;
    const cleanVal = val.replace(/\s+/g, '');
    const cleanTarget = targetRaw.replace(/\s+/g, '');

    // 正解判定
    if (cleanVal === cleanTarget) {
      playSound('correct');
      const newCompletedIds = [...completedIds, currentStudent.id];
      setCompletedIds(newCompletedIds);
      setInputVal('');
      pickNextStudent(newCompletedIds, targetCount);
    } 
    // 間違い判定（入力された文字が、正解の先頭と一致していなければ「間違い」とみなして揺らす）
    else {
      // まだ入力途中ならOK、明らかに違う文字を打ったらNG
      if (!cleanTarget.startsWith(cleanVal) && cleanVal.length > 0) {
        setIsShake(true); // 揺らす！
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && endTime) {
      startGame(gameMode, targetCount);
    }
  };

  const formatTime = (time) => time ? time.toFixed(2) : '-.--';

  const shareResult = (platform) => {
    const time = formatTime((endTime - startTime) / 1000);
    const modeStr = gameMode === 'reading' ? 'ひらがな' : '漢字';
    const text = `【104名前当て】${targetCount}人モード(${modeStr})を${time}秒でクリア！`;
    const url = window.location.href;
    if (platform === 'line') window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text + '\n' + url)}`, '_blank');
    if (platform === 'x') window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
  };

  return (
    <div className="container">
      {/* プログレスバー（上部の進捗棒） */}
      {isGameStarted && !endTime && (
        <div className="progress-bar-container">
          <div 
            className="progress-bar-fill" 
            style={{ width: `${(completedIds.length / targetCount) * 100}%` }}
          ></div>
        </div>
      )}

      <h1>104 名前当てタイムアタック</h1>
      
      {!isGameStarted && !endTime && (
        <div className="start-screen">
          <div className="section-group">
            <h3>⚡️ サクッと (10問)</h3>
            <div className="button-row">
              <button onClick={() => startGame('reading', 10)} className="btn-primary">ひらがな</button>
              <button onClick={() => startGame('name', 10)} className="btn-secondary">漢字</button>
            </div>
          </div>

          <div className="section-group">
            <h3>🔥 全員 (37問)</h3>
            <div className="button-row">
              <button onClick={() => startGame('reading', 37)} className="btn-primary">ひらがな</button>
              <button onClick={() => startGame('name', 37)} className="btn-secondary">漢字</button>
            </div>
          </div>

          {ranking.length > 0 && (
            <div className="ranking-box">
              <h3>🏆 履歴 (Top 10)</h3>
              <ul>
                {ranking.map((r, i) => (
                  <li key={i} className={i === 0 ? 'rank-1' : ''}>
                    <span className="rank-left">
                      <span className="rank-num">{i + 1}.</span>
                      <span className="rank-mode-tag">{r.count}人/{r.mode === 'reading' ? 'ひ' : '漢'}</span>
                    </span>
                    <span className="rank-time">{formatTime(r.time)}秒</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {isGameStarted && !endTime && currentStudent && (
        <div className="game-screen">
          <div className="header-info">
             <span className="progress">残り: {targetCount - completedIds.length} 人</span>
             <span className="mode-badge">{targetCount}人 / {gameMode === 'reading' ? 'ひ' : '漢'}</span>
          </div>
          
          <div className="question-card">
            <h2 className="student-number">{currentStudent.id}番</h2>
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
          <p className="hint">※入力すると自動判定</p>
        </div>
      )}

      {endTime && (
        <div className="result-screen" onKeyDown={handleKeyDown}>
          <h2>🎉 CLEAR! 🎉</h2>
          <p className="sub-title">{targetCount}人モード ({gameMode === 'reading' ? 'ひらがな' : '漢字'})</p>
          
          <div className="result-box">
            <p className="time-label">Time</p>
            <p className="time-display">{formatTime((endTime - startTime) / 1000)} 秒</p>
          </div>

          <div className="share-area">
            <div className="share-buttons">
              <button onClick={() => shareResult('line')} className="btn-line">LINE</button>
              <button onClick={() => shareResult('x')} className="btn-x">X</button>
            </div>
          </div>

          <div className="retry-buttons">
            <button onClick={() => startGame(gameMode, targetCount)} className="btn-primary">もう一度やる</button>
            <button onClick={() => {setIsGameStarted(false); setEndTime(null);}} className="btn-text">モード選択に戻る</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
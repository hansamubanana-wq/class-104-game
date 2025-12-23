import { useState, useEffect, useRef } from 'react';
import './App.css';
import { students } from './students';

function App() {
  // ゲームの状態管理
  const [currentStudent, setCurrentStudent] = useState(null); // 現在の問題
  const [inputVal, setInputVal] = useState(''); // 入力された文字
  const [completedIds, setCompletedIds] = useState([]); // 正解済みのIDリスト
  const [startTime, setStartTime] = useState(null); // 開始時間
  const [endTime, setEndTime] = useState(null); // 終了時間
  const [isGameStarted, setIsGameStarted] = useState(false); // ゲーム中かどうか
  
  // 入力欄に自動でカーソルを合わせるための設定
  const inputRef = useRef(null);

  // ゲーム開始処理
  const startGame = () => {
    setCompletedIds([]);
    setEndTime(null);
    setInputVal('');
    setIsGameStarted(true);
    setStartTime(Date.now());
    pickNextStudent([]);
  };

  // 次の問題を選ぶ処理
  const pickNextStudent = (doneIds) => {
    // まだ正解していない生徒のIDリストを作成
    const remainingStudents = students.filter(s => !doneIds.includes(s.id));
    
    if (remainingStudents.length === 0) {
      // 全員終わったら終了
      setEndTime(Date.now());
      setCurrentStudent(null);
      return;
    }

    // ランダムに1人選ぶ
    const randomIndex = Math.floor(Math.random() * remainingStudents.length);
    setCurrentStudent(remainingStudents[randomIndex]);
  };

  // 文字が入力されるたびに実行される処理
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputVal(val);

    if (!currentStudent) return;

    // 正誤判定（ひらがなで一致するか）
    if (val === currentStudent.reading) {
      // 正解の場合
      const newCompletedIds = [...completedIds, currentStudent.id];
      setCompletedIds(newCompletedIds);
      setInputVal(''); // 入力欄を空にする
      pickNextStudent(newCompletedIds); // 次の問題へ
    }
  };

  // エンターキーでリトライなどを操作する場合用
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && endTime) {
      startGame();
    }
  };

  // 画面描画
  return (
    <div className="container">
      <h1>104 名前当てタイムアタック</h1>
      
      {!isGameStarted && !endTime && (
        <div className="start-screen">
          <p>出席番号順の37人全員の名前を答えろ！</p>
          <button onClick={startGame} className="btn-primary">スタート</button>
        </div>
      )}

      {isGameStarted && !endTime && currentStudent && (
        <div className="game-screen">
          <div className="progress">
            残り: {37 - completedIds.length} 人
          </div>
          
          <div className="question-card">
            <h2 className="student-number">{currentStudent.id}番</h2>
          </div>

          <div className="input-area">
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={handleInputChange}
              placeholder="ひらがなで入力（例：ほんだおさむ）"
              autoFocus
            />
          </div>
          <p className="hint">※入力すると自動で判定されます</p>
        </div>
      )}

      {endTime && (
        <div className="result-screen" onKeyDown={handleKeyDown}>
          <h2>クリア！</h2>
          <p className="time-display">
            記録: {((endTime - startTime) / 1000).toFixed(2)} 秒
          </p>
          <button onClick={startGame} className="btn-primary">もう一度挑戦</button>
        </div>
      )}
    </div>
  );
}

export default App;
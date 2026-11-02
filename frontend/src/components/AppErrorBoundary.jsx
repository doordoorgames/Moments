import React from 'react';

// Catches a crash anywhere below it so the player never ends up on a blank page.
//
// - A part of the app that failed to download (usually code from an older deployment) offers a
//   reload, because loading the current code is the only real fix. The player taps it; nothing
//   reloads by itself. Game rooms keep their seat in localStorage, so the player rejoins where they were.
// - Any other crash offers "try again", which redraws the screen in place without reloading:
//   game state comes back from the server.
// `compact` is the small in-game version (one challenge failed, the rest of the race stays up).

export const isChunkError = err => {
  const text = `${err?.name || ''} ${err?.message || ''}`;
  return /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed/i.test(text);
};

const COPY = {
  oops: ['صار خلل بسيط', 'Something went wrong'],
  retry: ['حاول مرة ثانية', 'Try again'],
  stale: ['في نسخة جديدة من اللعبة', 'A new version of the game is ready'],
  reload: ['حمّل من جديد', 'Load it'],
};

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {error: null, tries: 0};
    this.retry = this.retry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return {error};
  }

  componentDidCatch(error, info) {
    // keep a trace for debugging; nothing is sent anywhere
    console.error('[Moments] screen crashed', error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    // moving to another screen clears an old error
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({error: null});
  }

  retry() {
    const {error} = this.state;
    if (isChunkError(error)) { window.location.reload(); return; }
    this.setState(s => ({error: null, tries: s.tries + 1}));
  }

  render() {
    const {error, tries} = this.state;
    if (!error) return <React.Fragment key={tries}>{this.props.children}</React.Fragment>;
    const stale = isChunkError(error);
    const lines = stale ? COPY.stale : COPY.oops;
    const action = stale ? COPY.reload : COPY.retry;
    if (this.props.compact) {
      return <div className="app-crash is-compact" role="alert">
        <p>{lines[0]} · {lines[1]}</p>
        <button type="button" onClick={this.retry}>{action[0]} · {action[1]}</button>
      </div>;
    }
    return <div className="app-crash" role="alert">
      <p lang="ar" dir="rtl">{lines[0]}</p>
      <p lang="en">{lines[1]}</p>
      <button type="button" onClick={this.retry}><span lang="ar">{action[0]}</span><span lang="en">{action[1]}</span></button>
    </div>;
  }
}

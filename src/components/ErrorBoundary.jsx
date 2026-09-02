import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/** Catches render errors of a page. Give it a `key` that changes on navigation so it resets. */
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('Unhandled render error', error, info);
    }

    render() {
        if (!this.state.error) return this.props.children;
        return (
            <div className="error-boundary card" role="alert">
                <AlertTriangle size={28} aria-hidden="true" />
                <h3>{this.props.title || 'Something went wrong on this page'}</h3>
                <p className="muted">{String(this.state.error?.message || this.state.error)}</p>
                <button type="button" className="btn btn-secondary" onClick={() => this.setState({ error: null })}>
                    <RefreshCw size={14} /> Try again
                </button>
            </div>
        );
    }
}

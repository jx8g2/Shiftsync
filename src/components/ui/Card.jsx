import './Card.css';

function Card({ children, className = '', onClick, hoverable = false }) {
    return (
        <div
            className={`card ${hoverable ? 'card-hoverable' : ''} ${className}`}
            onClick={onClick}
        >
            {children}
        </div>
    );
}

function CardHeader({ children, action }) {
    return (
        <div className="card-header">
            <div className="card-header-content">{children}</div>
            {action && <div className="card-header-action">{action}</div>}
        </div>
    );
}

function CardBody({ children }) {
    return <div className="card-body">{children}</div>;
}

function StatCard({ icon, iconColor = 'primary', value, label, trend }) {
    return (
        <div className="stat-card">
            <div className={`stat-icon ${iconColor}`}>{icon}</div>
            <div className="stat-content">
                <h3>{value}</h3>
                <p>{label}</p>
                {trend && (
                    <span className={`stat-trend ${trend > 0 ? 'positive' : 'negative'}`}>
                        {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
                    </span>
                )}
            </div>
        </div>
    );
}

Card.Header = CardHeader;
Card.Body = CardBody;
Card.Stat = StatCard;

export default Card;

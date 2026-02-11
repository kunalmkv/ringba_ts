-- Neon DB schema for Fetch eLocal Calls service
-- Derived from ringbav2/src/database/schema.sql (scraping_sessions, elocal_call_data, adjustment_details only)

-- Table to track scraping sessions
CREATE TABLE IF NOT EXISTS scraping_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'running',
    calls_scraped INTEGER DEFAULT 0,
    adjustments_scraped INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table to store campaign calls (eLocal)
CREATE TABLE IF NOT EXISTS elocal_call_data (
    id SERIAL PRIMARY KEY,
    caller_id VARCHAR(50) NOT NULL,
    call_timestamp VARCHAR(100) NOT NULL,
    elocal_payout DECIMAL(10, 2) DEFAULT 0,
    category VARCHAR(50) DEFAULT 'STATIC',
    city_state VARCHAR(255),
    zip_code VARCHAR(20),
    call_duration INTEGER,
    adjustment_time VARCHAR(100) DEFAULT '',
    adjustment_amount DECIMAL(10, 2) DEFAULT 0,
    unmatched BOOLEAN DEFAULT FALSE,
    ringba_id VARCHAR(255),
    ringba_original_payout DECIMAL(10, 2) DEFAULT NULL,
    ringba_original_revenue DECIMAL(10, 2) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(caller_id, call_timestamp, category)
);

-- Table to store adjustment details
CREATE TABLE IF NOT EXISTS adjustment_details (
    id SERIAL PRIMARY KEY,
    time_of_call VARCHAR(100) NOT NULL,
    adjustment_time VARCHAR(100) NOT NULL,
    campaign_phone VARCHAR(50) DEFAULT '(877) 834-1273',
    caller_id VARCHAR(50) NOT NULL,
    duration INTEGER DEFAULT 0,
    call_sid VARCHAR(255),
    amount DECIMAL(10, 2) DEFAULT 0,
    classification VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for scraping_sessions
CREATE INDEX IF NOT EXISTS idx_scraping_sessions_session_id ON scraping_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_scraping_sessions_status ON scraping_sessions(status);

-- Indexes for elocal_call_data
CREATE INDEX IF NOT EXISTS idx_elocal_call_data_caller_id ON elocal_call_data(caller_id);
CREATE INDEX IF NOT EXISTS idx_elocal_call_data_call_timestamp ON elocal_call_data(call_timestamp);
CREATE INDEX IF NOT EXISTS idx_elocal_call_data_category ON elocal_call_data(category);
CREATE INDEX IF NOT EXISTS idx_elocal_call_data_ringba_id ON elocal_call_data(ringba_id);
CREATE INDEX IF NOT EXISTS idx_elocal_call_data_ringba_original_payout ON elocal_call_data(ringba_original_payout);
CREATE INDEX IF NOT EXISTS idx_elocal_call_data_ringba_original_revenue ON elocal_call_data(ringba_original_revenue);
CREATE INDEX IF NOT EXISTS idx_caller_timestamp_category ON elocal_call_data(caller_id, call_timestamp, category);

-- Indexes for adjustment_details
CREATE INDEX IF NOT EXISTS idx_adjustment_details_caller_id ON adjustment_details(caller_id);
CREATE INDEX IF NOT EXISTS idx_adjustment_details_time_of_call ON adjustment_details(time_of_call);
CREATE INDEX IF NOT EXISTS idx_adjustment_details_call_sid ON adjustment_details(call_sid);

-- Table to store Ringba calls (raw data from Ringba API) - for Ringba Original Sync
CREATE TABLE IF NOT EXISTS ringba_original_sync (
    id SERIAL PRIMARY KEY,
    ringba_id VARCHAR(255) UNIQUE NOT NULL,
    call_timestamp VARCHAR(100) NOT NULL,
    caller_id VARCHAR(50),
    ringba_payout DECIMAL(10, 2) DEFAULT 0,
    ringba_revenue_amount DECIMAL(10, 2) DEFAULT 0,
    call_duration INTEGER DEFAULT 0,
    target_id VARCHAR(255),
    target_name VARCHAR(255),
    campaign_name VARCHAR(255),
    publisher_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ringba_original_sync_ringba_id ON ringba_original_sync(ringba_id);
CREATE INDEX IF NOT EXISTS idx_ringba_original_sync_caller_id ON ringba_original_sync(caller_id);
CREATE INDEX IF NOT EXISTS idx_ringba_original_sync_call_timestamp ON ringba_original_sync(call_timestamp);

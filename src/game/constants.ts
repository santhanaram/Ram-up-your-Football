// Pitch and goal dimensions in metres. World axes: the pitch runs along z,
// Blue Lions (home) attack towards -z, Red Eagles (away) attack towards +z.
export const FIELD_LENGTH = 105;
export const FIELD_WIDTH = 68;
export const HALF_LENGTH = FIELD_LENGTH / 2;
export const HALF_WIDTH = FIELD_WIDTH / 2;
export const GOAL_WIDTH = 7.32;
export const GOAL_HEIGHT = 2.44;
export const GOAL_DEPTH = 2.0;
export const PENALTY_DEPTH = 16.5;
export const PENALTY_WIDTH = 40.3;
export const SIX_YARD_DEPTH = 5.5;
export const SIX_YARD_WIDTH = 18.32;
export const CENTRE_CIRCLE_RADIUS = 9.15;

// Ball
export const BALL_RADIUS = 0.22;
export const GRAVITY = -9.81;
export const GROUND_DRAG = 0.95; // exponential speed loss per second while rolling
export const AIR_DRAG = 0.12; // per second in flight
export const BOUNCE = 0.55; // vertical restitution
export const SPIN_DECAY = 1.2; // per second
export const CURL_STRENGTH = 0.35; // rad/s the flight path turns per unit of spin

// Players
export const PLAYER_SCALE = 0.75; // model is ~2.5 units tall; scale to ~1.85 m
export const RUN_SPEED = 7.2;
export const SPRINT_SPEED = 8.4;
export const DRIBBLE_SPEED = 6.6;
export const JOG_SPEED = 5.0;
export const ACCELERATION = 9.0; // velocity blend rate per second
export const CONTROL_RADIUS = 0.9; // feet reach for collecting the ball
export const KICK_RELEASE = 0.14; // seconds from button press to foot contact
export const KICK_DURATION = 0.38;

// Match
export const HALF_REAL_SECONDS = 150; // each half lasts 2.5 real minutes
export const GAME_SECONDS_PER_HALF = 45 * 60;

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal


@dataclass(frozen=True, slots=True)
class Gameweek:
    id: int
    name: str
    deadline: datetime
    finished: bool
    is_current: bool
    is_next: bool
    average_score: int
    highest_score: int | None


@dataclass(frozen=True, slots=True)
class Team:
    id: int
    code: int
    name: str
    short_name: str
    strength: int | None
    home_strength: int
    away_strength: int


@dataclass(frozen=True, slots=True)
class PlayerPosition:
    id: int
    name: str
    short_name: str
    squad_size: int
    minimum_starters: int
    maximum_starters: int


@dataclass(frozen=True, slots=True)
class Player:
    id: int
    code: int
    first_name: str
    last_name: str
    display_name: str
    team_id: int
    position_id: int
    price: int
    total_points: int
    gameweek_points: int
    form: Decimal
    ownership_percentage: Decimal
    expected_goals_per_90: Decimal
    expected_assists_per_90: Decimal
    status: str
    news: str
    chance_of_playing_next_round: int | None


@dataclass(frozen=True, slots=True)
class Fixture:
    id: int
    code: int
    gameweek: int | None
    kickoff: datetime | None
    finished: bool
    started: bool
    home_team_id: int
    away_team_id: int
    home_score: int | None
    away_score: int | None
    home_difficulty: int
    away_difficulty: int


@dataclass(frozen=True, slots=True)
class Manager:
    id: int
    first_name: str
    last_name: str
    team_name: str
    started_gameweek: int
    current_gameweek: int
    overall_points: int
    overall_rank: int | None
    gameweek_points: int
    gameweek_rank: int | None
    bank: int
    team_value: int


@dataclass(frozen=True, slots=True)
class SquadSummary:
    gameweek: int
    points: int
    total_points: int
    overall_rank: int | None
    bank: int
    team_value: int
    transfers: int
    transfer_cost: int
    bench_points: int


@dataclass(frozen=True, slots=True)
class SquadPick:
    player_id: int
    position: int
    multiplier: int
    is_captain: bool
    is_vice_captain: bool
    position_id: int
    purchase_price: int | None = None
    selling_price: int | None = None


@dataclass(frozen=True, slots=True)
class Squad:
    active_chip: str | None
    summary: SquadSummary
    picks: tuple[SquadPick, ...]


@dataclass(frozen=True, slots=True)
class PlayerFixture:
    id: int
    gameweek: int | None
    gameweek_name: str
    kickoff: datetime | None
    is_home: bool
    home_team_id: int
    away_team_id: int
    difficulty: int


@dataclass(frozen=True, slots=True)
class PlayerGameweekHistory:
    player_id: int
    fixture_id: int
    opponent_team_id: int
    gameweek: int
    was_home: bool
    kickoff: datetime
    points: int
    minutes: int
    goals: int
    assists: int
    clean_sheets: int
    goals_conceded: int
    bonus: int
    bps: int
    price: int
    selected: int
    transfers_in: int
    transfers_out: int


@dataclass(frozen=True, slots=True)
class PlayerSeasonHistory:
    season: str
    player_code: int
    start_price: int
    end_price: int
    points: int
    minutes: int
    goals: int
    assists: int
    clean_sheets: int
    goals_conceded: int
    bonus: int
    bps: int


@dataclass(frozen=True, slots=True)
class PlayerHistory:
    fixtures: tuple[PlayerFixture, ...] = field(default_factory=tuple)
    current_season: tuple[PlayerGameweekHistory, ...] = field(default_factory=tuple)
    previous_seasons: tuple[PlayerSeasonHistory, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class BootstrapData:
    gameweeks: tuple[Gameweek, ...]
    teams: tuple[Team, ...]
    player_positions: tuple[PlayerPosition, ...]
    players: tuple[Player, ...]


def parse_datetime(value: str | None) -> datetime | None:
    if value is None:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def iso_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat().replace("+00:00", "Z")


def player_photo_url(code: int) -> str:
    if code <= 0:
        return "/images/player-placeholder.svg"
    return f"https://resources.premierleague.com/premierleague/photos/players/110x140/p{code}.png"
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import Login from './Login';
import WaitingRoom from './WaitingRoom';
import { renderWithGame, testUser } from './testing/renderWithGame';
import { Role, type User } from '../types';

const button = (out: string, text: string) =>
  out.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${text}(?:(?!</button>).)*</button>`, 's'))?.[0] ?? '';
const input = (out: string, id: string) => out.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? '';

describe('Login screen', () => {
  const student = () => renderWithGame(Login);
  const instructor = () => renderWithGame(() => createElement(Login, { initialTab: 'instructor' }));

  it('heads the card with the logo, the name and the subtitle', () => {
    const out = student();
    expect(out).toContain('alt="UCLA Anderson School of Management"');
    expect(out).toContain('The Joke Factory');
    expect(out).toContain('An operations management simulation');
  });

  it('switches between Student pair and Instructor with pressed buttons', () => {
    const out = student();
    expect(button(out, 'Student pair')).toContain('aria-pressed="true"');
    expect(button(out, 'Instructor')).toContain('aria-pressed="false"');
    const inst = instructor();
    expect(button(inst, 'Student pair')).toContain('aria-pressed="false"');
    expect(button(inst, 'Instructor</button>')).toContain('aria-pressed="true"');
  });

  it('asks for both first names with Joe and John as placeholders, and labels each field', () => {
    const out = student();
    expect(out).toContain('You and your partner');
    expect(out).toContain('Your first name');
    expect(out).toContain('Partner&#x27;s first name');
    expect(input(out, 'jf-member-1')).toContain('placeholder="Joe"');
    expect(input(out, 'jf-member-2')).toContain('placeholder="John"');
    expect(out).toContain('for="jf-member-1"');
    expect(out).toContain('for="jf-member-2"');
  });

  it('explains the shared seat and how to get back in, with Lost connection in bold', () => {
    const out = student();
    expect(out.replace(/<[^>]*>/g, '')).toContain(
      'You two share one seat, as either the Joke Maker or Marketing. Lost connection? Sign in again with the same two names.',
    );
    expect(out).toMatch(/<b[^>]*>Lost connection\?<\/b>/);
  });

  it('keeps the gold Join the class button disabled while the names are blank', () => {
    const join = button(student(), 'Join the class');
    expect(join).toContain('disabled=""');
    expect(join).toContain('type="submit"');
  });

  it('gives the instructor name field no placeholder and offers a Show toggle on the password', () => {
    const out = instructor();
    expect(out).toContain('Your name');
    expect(out).toContain('Admin password');
    expect(input(out, 'jf-instructor-name')).not.toContain('placeholder');
    expect(input(out, 'jf-instructor-password')).toContain('type="password"');
    expect(button(out, 'Show')).toContain('aria-pressed="false"');
    expect(button(out, 'Sign in')).toContain('type="submit"');
    expect(out).not.toContain('That password didn&#x27;t work');
  });

  it('uses no old labels, em dashes or exclamation marks', () => {
    for (const out of [student(), instructor()]) {
      for (const old of ['Student Pair Login', 'Instructor Login', 'Join Lobby', 'Login as Instructor']) {
        expect(out).not.toContain(old);
      }
      expect(out).not.toContain('—');
      expect(out.replace(/<[^>]*>/g, '')).not.toContain('!');
    }
  });
});

describe('Waiting room', () => {
  const seat = (role: Role, over: Partial<User> = {}): User => ({
    ...testUser(role, null), display_name: 'joe_john', name: 'joe_john', ...over,
  });
  const render = (user: User) => renderWithGame(WaitingRoom, {
    user, roundStatuses: { 1: 'CONFIGURED', 2: 'CONFIGURED' },
  });

  it('greets the pair by their formatted names, in the heading and the header', () => {
    const out = render(seat(Role.UNASSIGNED));
    expect(out).toContain('You&#x27;re in, Joe and John.');
    expect(out).toContain('Signed in as Joe and John.');
    expect(out).toContain('Waiting room');
    expect(out).toContain('aria-label="Sign out"');
  });

  it('shows the round state and number in the andon', () => {
    const out = render(seat(Role.UNASSIGNED));
    expect(out).toContain('Not started');
    expect(out).toContain('Round 1');
  });

  it('while unassigned, waits on a team with no role card picked', () => {
    const out = render(seat(Role.UNASSIGNED));
    expect(out).toContain('Your instructor is seating everyone. Your screen switches on its own once you have a team.');
    expect(out).toContain('Seated on a team');
    expect(out).toContain('Your instructor gives each pair a team and a role.');
    expect(out).not.toContain('Your role');
    expect(out).toContain('Joined the class');
    expect(out).toContain('Round 1 starts');
    expect(out).toContain('A 1-minute tour shows you your screen first.');
    expect(out).toContain('Keep this tab open. You don&#x27;t need to refresh.');
    expect(out).toContain('While you wait: the two roles');
    expect(out).toContain('The goal');
  });

  it('seated as Marketing without a team, names the role and marks its card', () => {
    const out = render(seat(Role.QUALITY_CONTROL));
    expect(out).toContain('You&#x27;re Marketing. Your instructor is finishing the teams; your screen switches on its own.');
    expect(out).toContain('Seated as Marketing');
    expect(out).toContain('Waiting for your team to be set.');
    const card = out.match(/<div[^>]*data-role-card="marketing"[^>]*>(?:(?!data-role-card).)*/s)?.[0] ?? '';
    expect(card).toContain('Your role');
    expect(card).toContain('data-yours="true"');
    const jm = out.match(/<div[^>]*data-role-card="joke-maker"[^>]*>(?:(?!data-role-card).)*/s)?.[0] ?? '';
    expect(jm).not.toContain('Your role');
    expect(out).not.toContain('QUALITY');
  });

  it('seated as the Joke Maker, names that role', () => {
    const out = render(seat(Role.JOKE_MAKER));
    expect(out).toContain('Seated as Joke Maker');
    expect(out).toContain('You&#x27;re the Joke Maker.');
  });
});

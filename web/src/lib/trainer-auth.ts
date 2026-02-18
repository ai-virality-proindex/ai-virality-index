/**
 * Polymarket Trainer — Access Control
 *
 * The trainer is a personal feature, restricted to a specific user.
 */

const TRAINER_EMAIL = 'getdroneservices@gmail.com'

/** Check if the given email has access to the trainer. */
export function isTrainerUser(email: string | undefined | null): boolean {
  return email === TRAINER_EMAIL
}

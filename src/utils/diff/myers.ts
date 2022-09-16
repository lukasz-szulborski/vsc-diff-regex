import {
  CordsDiff,
  EditScriptOperation,
  EditScriptRecovery,
} from "../../types";
import { curry } from "../curry";

type Cords = [number, number];

type EditOperation = "Insert" | "Delete";

type History = number[][];

const print_operation = ({
  content,
  operation_type,
  pos_end,
  pos_start,
}: EditScriptOperation) => {
  console.log(
    `{\n\tpos_start: ${pos_start}\n\tpos_end: ${pos_end}\n\toperation_type: ${operation_type}\n\tcontent: ${content}\n}\n`
  );
};

const get_CordsDiff = (a_cords: Cords, b_cords: Cords): CordsDiff => ({
  x_delta: Math.abs(a_cords[0] - b_cords[0]),
  y_delta: Math.abs(a_cords[1] - b_cords[1]),
});

/*
 * Example:
 * (7, 7) (7, 6) -> Insert
 * (7, 6) (6, 6) -> Delete
 */
const get_operation_between_cords = (
  a_cords: Cords,
  b_cords: Cords
): EditOperation => {
  let { x_delta, y_delta } = get_CordsDiff(a_cords, b_cords);
  if (y_delta > x_delta) {
    return "Insert";
  } else {
    return "Delete";
  }
};

const are_cords_non_negative = (cords: Cords): boolean =>
  cords[0] >= 0 && cords[1] >= 0;

/*
 * Check if first cord is smaller or equal.
 */
const is_smaller_or_eq = (a_cords: Cords, b_cords: Cords): boolean =>
  a_cords[0] <= b_cords[0] && a_cords[1] <= b_cords[1];

const did_point_exceed_strings = (
  s1: string,
  s2: string,
  cord: Cords
): boolean => {
  const len1 = s1.length;
  const len2 = s2.length;
  if (cord[0] > len1 || cord[1] > len2) {
    return true;
  }
  return false;
};

/*
 * Whether coordinates are an endpoint to a snake.
 */
const is_end_of_snake = (
  cords: Cords,
  snake_length: number,
  s1: string,
  s2: string
): boolean => {
  const [x, y] = cords;
  if (x <= 0 || y <= 0 || did_point_exceed_strings(s1, s2, cords)) {
    return false;
  } else {
    const aux = (s1_index: number, s2_index: number, acc: number): number => {
      const are_equal = s1[s1_index] === s2[s2_index];
      if (are_equal === false || s1_index <= 0 || s2_index <= 0) {
        return are_equal ? acc + 1 : acc;
      }
      return aux(s1_index - 1, s2_index - 1, acc + 1);
    };
    return aux(x - 1, y - 1, 0) >= snake_length;
  }
};

/*
 * In edit graph, check whether it is possible to move from point A to point B given two strings where A > B. We move backward.
 *
 * It checks whether *one* step length in a certain direction is valid. E.g. it is not possible to make a move of length more than 1 if there is no diagnal.
 */
const is_step_distance_valid = (
  a_cords: Cords,
  b_cords: Cords,
  s1: string,
  s2: string
): boolean => {
  const [a_x, a_y] = a_cords;
  const [b_x, b_y] = b_cords;
  const d = get_CordsDiff(a_cords, b_cords);
  if (is_smaller_or_eq(b_cords, a_cords) === false) {
    return false;
  } else if (
    (d.x_delta === 1 && d.y_delta === 0) ||
    (d.x_delta === 0 && d.y_delta === 1)
  ) {
    return true;
  } else if (d.y_delta === d.x_delta) {
    if (b_x === 0 && b_y === 0) {
      return s1.slice(0, a_x) === s2.slice(0, a_x);
    } else {
      return false;
    }
  } else {
    const diagonal_length = d.y_delta < d.x_delta ? d.y_delta : d.x_delta;
    return is_end_of_snake(a_cords, diagonal_length, s1, s2);
  }
};

const get_cords = (state: number[], k_idx: number, k: number): Cords => {
  const x = state[k_idx];
  const y = x - k;
  return [x, y];
};

const generate_list = (start: number, fin: number, step: number) => {
  const go = (
    start: number,
    fin: number,
    step: number,
    acc: number[]
  ): number[] => {
    if (start === fin) {
      return [...acc, start];
    } else {
      return go(start + step, fin, step, [...acc, start]);
    }
  };
  return go(start, fin, step, []);
};

const remove_N_first_chars_of_string = (str: string, n: number): string => {
  return str.slice(n);
};

const remove_first_char_of_string = (str: string): string =>
  remove_N_first_chars_of_string(str, 1);

/*
 * Count equal characters at the beginning of each string.
 * eg. ('abc', 'abd') -> 2 ; ('abc', 'edf') -> 0
 */
const count_eq_chars = (s1: string, s2: string): number => {
  const go = (s1: string, s2: string, acc: number): number => {
    const l1 = s1.length;
    const l2 = s2.length;
    if (l1 === 0 || l2 === 0) {
      return acc;
    } else if (s1[0] === s2[0]) {
      return go(
        remove_first_char_of_string(s1),
        remove_first_char_of_string(s2),
        acc + 1
      );
    } else {
      return acc;
    }
  };
  return go(s1, s2, 0);
};

/*
 * Recover move from given position in a given direction of next V snapshot.
 */
const recover_single_move = (
  next_v_snapshot: number[],
  str1: string,
  str2: string,
  current_cords: Cords,
  edit_graph: EditScriptOperation[],
  aux_function: (...args: any) => any,
  history: History,
  is_out_of_bound: boolean,
  shifted_k: number,
  k: number
): EditScriptRecovery => {
  const len1 = str1.length;
  const len2 = str2.length;
  if (is_out_of_bound === false) {
    const next_cords = get_cords(next_v_snapshot, shifted_k, k);
    const [next_x, next_y] = next_cords;
    const can_travel = is_step_distance_valid(
      current_cords,
      next_cords,
      str1,
      str2
    );
    if (
      are_cords_non_negative(next_cords) === true &&
      can_travel === true &&
      next_x <= len1 &&
      next_y <= len2 &&
      is_smaller_or_eq(next_cords, current_cords) === true
    ) {
      const operation_type = get_operation_between_cords(
        current_cords,
        next_cords
      );
      const start_position = operation_type === "Delete" ? next_x : next_y;
      const end_position =
        operation_type === "Delete" ? next_x + 1 : next_y + 1;
      const last_move =
        edit_graph.length >= 1 ? edit_graph[edit_graph.length - 1] : undefined;
      const should_concat =
        last_move !== undefined &&
        operation_type === last_move.operation_type &&
        last_move.pos_start === end_position;
      const this_move_content =
        operation_type === "Insert"
          ? str2[start_position]
          : str1[start_position];
      const move: EditScriptOperation = {
        pos_start: start_position,
        pos_end: should_concat ? last_move.pos_end : end_position,
        operation_type: operation_type,
        content: should_concat
          ? `${this_move_content}${last_move.content}`
          : this_move_content,
      };
      const new_edit_graph = should_concat
        ? [...edit_graph.slice(0, -1), move]
        : [...edit_graph, move];
      const [_, ...rest_history] = history;
      return aux_function(rest_history, k, false, new_edit_graph);
    } else {
      return aux_function([], k, true, edit_graph);
    }
  } else {
    // If move impossible then don't continue this path.
    return aux_function([], k, true, edit_graph);
  }
};

/**
 * Not using Hunt & Szymanski LCS because R parameter is expected to be large (there would be a lot of matches between two strings)
 *
 *
 * @see(http://www.xmailserver.org/diff2.pdf) myers algo
 */
export const myersDiff = (str1: string, str2: string) => {
  const len1 = str1.length;
  const len2 = str2.length;
  // Let 'nm' be the maximum number of moves in the edit graph.
  const nm = len1 + len2;
  const total_number_of_diagonals = nm * 2 + 1;
  // let 'v' be the array that holds reached depth (x axis) of particular k diagonal.
  // There is nm * 2 + 1 such diagonals starting from -nm to nm (including zero thus '+ 1').
  const v = Array(total_number_of_diagonals).fill(0);
  const is_out_of_bound = (x: number): boolean => x < 0 || x > v.length - 1;
  // Make move given we're making Dth move and we have some state of moves basing on previous moves (v array).
  const make_move_on_ks = (
    diagonals: number[],
    v: number[],
    d: number,
    reached_NM: boolean
  ): [number[], boolean] => {
    if (diagonals.length === 0) {
      return [v, reached_NM];
    } else {
      const [k, ...t] = diagonals;
      const shifted_k = k + nm; // Adjust to array indexing. Array indices cannot be negative.
      // Check whether to make a move.
      let updated_v = v; // For d = 0 do not move right or down. Just return current state.
      if (d > 0) {
        // Check whether to move down.
        const down =
          k === -d ||
          (k !== -d &&
            is_out_of_bound(shifted_k - 1) === false &&
            is_out_of_bound(shifted_k + 1) === false &&
            v[shifted_k - 1] < v[shifted_k + 1]);
        if (down) {
          updated_v = v.map((a, i) => (i === shifted_k ? v[shifted_k + 1] : a));
        } else {
          // Update k-diagonal depth for right move.
          updated_v = v.map((a, i) =>
            i === shifted_k ? v[shifted_k - 1] + 1 : a
          );
        }
      }
      // At this point we've made a move (or not). Let's check if it's possible to travel diagonal.
      const [x, y] = get_cords(updated_v, shifted_k, k);
      if (x + 1 <= len1 && y + 1 <= len2) {
        updated_v = updated_v.map((a, i) => {
          if (i === shifted_k) {
            return (
              a +
              count_eq_chars(
                remove_N_first_chars_of_string(str1, x),
                remove_N_first_chars_of_string(str2, y)
              )
            );
          } else {
            return a;
          }
        });
      }
      // Get (x, y) once more because it could have been changed by diagonal traversal.
      const [new_x, new_y] = get_cords(updated_v, shifted_k, k);
      // Check whether reached endpoint equals (N, M) final endpoint (end of the edit graph).
      if (new_x === len1 && new_y === len2) {
        return make_move_on_ks([], updated_v, d, true);
      } else {
        return make_move_on_ks(t, updated_v, d, false);
      }
    }
  };
  /*
        Take number of possible moves for given strings and produce array of moves history.
        Each history array item holds an array of x values for each k-diagonal where X value means furthest possible position of k-diagonal on X axis in edit graph during Dth move.
        This array of k-diagonal states facilitates recovering the shortest path from (N, M) to (0,0). 
    */
  const traverse_edit_graph = (moves: number, history: History): History => {
    const go = (dth_move: number, history: History): History => {
      // Result of previous move.
      const previous_v_snapshot = history[history.length - 1];
      if (dth_move > moves) {
        return history;
      } else {
        const [new_v, reached_NM] = make_move_on_ks(
          generate_list(dth_move * -1, dth_move, 2),
          previous_v_snapshot,
          dth_move,
          false
        );
        const new_history = [...history, new_v];
        if (reached_NM === true) {
          // If (N, M) was reached then stop computation for bigger ds.
          return go(moves + 1, new_history);
        } else {
          return go(dth_move + 1, new_history);
        }
      }
    };
    return go(0, history);
  };
  // Basing on list of snapshots of v-array (obtained in traverse_edit_graph) create an optimal edit script.
  const recover_edit_script = (history: History): EditScriptRecovery => {
    const aux = (
      history: History,
      current_k_diag: number,
      invalid_path: boolean,
      edit_graph: EditScriptOperation[]
    ): EditScriptRecovery => {
      const shifted_k = current_k_diag + nm; // Adjust to array indexing. Array indices cannot be negative.
      const history_len = history.length;
      if (history_len <= 1) {
        return {
          operations: edit_graph,
          is_invalid_path: invalid_path,
        };
      } else {
        const v_snapshot = history[0]; // Pop snapshot from "stack".
        const [x, y] = get_cords(v_snapshot, shifted_k, current_k_diag); // Current position.
        // If current position is (0, 0) then end the algorithm, we've reached the beginning of the edit script.
        if (x === 0 && y === 0) {
          return {
            operations: edit_graph,
            is_invalid_path: false,
          };
        }
        const shifted_k_left = shifted_k - 1;
        const shifted_k_right = shifted_k + 1;
        const is_left_move_out_of_bound = is_out_of_bound(shifted_k_left);
        const is_right_move_out_of_bound = is_out_of_bound(shifted_k_right);
        const next_v_snapshot = history[1];
        // Get state of current k diagonal in a previous move and check whether there is a diagonal on edit graph beginning.
        // Sometimes, when edit graph starts with a diagonal, it is vital to move downward in order to finish algorith run.
        const bottom_cords = get_cords(
          next_v_snapshot,
          shifted_k,
          shifted_k - nm
        );
        if (
          bottom_cords[0] === 0 &&
          bottom_cords[1] === 0 &&
          is_step_distance_valid([x, y], bottom_cords, str1, str2)
        ) {
          return {
            operations: edit_graph,
            is_invalid_path: false,
          };
        }
        const curried_recover_single_move = curry(recover_single_move);
        const prepared_recover_single_move = curried_recover_single_move(
          next_v_snapshot,
          str1,
          str2,
          [x, y],
          edit_graph,
          aux,
          history
        );
        // Take next possible moves for left and right.
        const left_path = prepared_recover_single_move(
          is_left_move_out_of_bound,
          shifted_k_left,
          shifted_k_left - nm
        );
        const right_path = prepared_recover_single_move(
          is_right_move_out_of_bound,
          shifted_k_right,
          shifted_k_right - nm
        );
        // Choose path. Favour shorter paths and those with more deletions.
        const left_length = left_path.operations.length;
        const right_length = right_path.operations.length;
        if (left_path.is_invalid_path === true) {
          return right_path;
        } else if (right_path.is_invalid_path === true) {
          return left_path;
        } else {
          if (left_length >= right_length) {
            return right_path;
          } else {
            return left_path;
          }
        }
      }
    };
    return aux(history, len1 - len2, false, []);
  };
  const history = traverse_edit_graph(nm, [v]);
  const edit_script = recover_edit_script(history.reverse());
  return edit_script;
};

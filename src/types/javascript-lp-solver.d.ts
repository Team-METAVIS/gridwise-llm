declare module "javascript-lp-solver" {
  export interface LPConstraint {
    min?: number;
    max?: number;
    equal?: number;
  }

  export interface LPModel {
    optimize: string;
    opType: "min" | "max";
    constraints: Record<string, LPConstraint>;
    variables: Record<string, Record<string, number>>;
  }

  export interface LPResult {
    feasible: boolean;
    result: number;
    bounded?: boolean;
    [variableName: string]: number | boolean | undefined;
  }

  const solver: {
    Solve(model: LPModel): LPResult;
  };

  export = solver;
}

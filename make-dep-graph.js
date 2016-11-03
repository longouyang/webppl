var _ = require('underscore');
var esprima = require('esprima');
var estraverse = require('estraverse');

function model() {
  var x = gaussian(0, 1);
  var y = gaussian(x, 1);
  var z = x + y;

  return z;
};

function model2() {
  var x = gaussian(0, 1);
  var y = gaussian(x, 1);
  var z = gaussian(x, 1);

  return z;
};



// var tokenized = esprima.tokenize(model.toString());
// var parsed = esprima.parse(tokenized)

// console.log(parsed);

// ast should be a single FunctionDeclaration that contains a single BlockStatement
var getTopLevelVars = function(ast) {
  return _.chain(ast.body[0].body.body)
    .where({type: 'VariableDeclaration'})
    .pluck('declarations')
    .flatten()
    .pluck('id')
    .pluck('name')
    .value();
}



var treeIdentifiers = function(t, name) {

  var names = [];

  estraverse.traverse(t, {
    enter: function (node, parent) {
      if (node.type == 'Identifier') {
        names.push(node.name);
      }
    },
    leave: function (node, parent) {
    }
  });

  return names;
}

var topLevelDependencies = function(ast) {
  var varNames = getTopLevelVars(ast);

  var modelBody = ast.body[0].body.body;

  return _.map(varNames,
               function(varName) {

                 var declaration = _.find(modelBody,
                                          function(ast1) {
                                            return ast1.type == 'VariableDeclaration' &&
                                              ast1.declarations[0].id.name == varName
                                          });

                 var otherIdentifiers = _.without(treeIdentifiers(declaration), varName);
                 return _.intersection(varNames, otherIdentifiers);

               })
}


var parsed = esprima.parse(model.toString());

// console.log(topLevelDependencies(parsed))

var dependencies = {
  x: [],
  y: [],
  z: ['x','y']
}

var dependencies2 = {
  x: [],
  y: ['x'],
  z: ['x']
}

var dependencies3 = {
  a: [],
  b: ['a','c'],
  c: [],
  d: ['e'],
  e: [],
  f: ['e','c']
}

var bayesBall = function(dependencies, query, givens) {
  var getParents = function(node) {
    return dependencies[node];
  }

  var getChildren = function(node) {
    return _.keys(_.pick(dependencies,
                         function(v, k) {
                           return (_.contains(v, node))
                         }));
  }

  var curNode;
  var numVisited = 0;
  var visited = {};
  var queue = [query];

  var relation = function(a,b) {
    if (_.contains(dependencies[a], b)) {
      return 'child' // a is a child of b
    } else {
      return 'parent'
    }
  }

  // visit query
  while(true) {
    if (queue.length == 0) {
      break;
    }
    var lastNode = curNode;
    curNode = queue.shift();
    var from = !lastNode ? 'child' : relation(lastNode, curNode);

    // console.log('last: ', lastNode);
    // console.log('curr: ', curNode);
    // console.log('from: ', from);
    // console.log('');

    if (!_.has(visited, curNode)) {
      visited[curNode] = {};
    }

    if (visited[curNode][from]) {
      continue;
    }

    visited[curNode][from] = true;

    if (from == 'child') {
      if (_.contains(givens, curNode)) {

      } else {
        queue = queue.concat(getParents(curNode), getChildren(curNode))
      }
    } else {
      if (_.contains(givens, curNode)) {
        console.log(getParents(curNode));
        queue = queue.concat(getParents(curNode))
      } else {
        queue = queue.concat(getChildren(curNode))
      }
    }
  }

  return visited;

}

console.log(bayesBall(dependencies, 'x', ['z']))

console.log(bayesBall(dependencies2, 'y', ['x']))

console.log(bayesBall(dependencies3, 'f', ['b','e']))

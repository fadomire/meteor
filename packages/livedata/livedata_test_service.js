Meteor.methods({
  nothing: function () {
  },
  echo: function (/* arguments */) {
    return _.toArray(arguments);
  },
  exception: function (where, intended) {
    var shouldThrow =
      (Meteor.is_server && where === "server") ||
      (Meteor.is_client && where === "client") ||
      where === "both";

    if (shouldThrow) {
      var e;
      if (intended)
        e = new Meteor.Error(999, "Client-visible test exception");
      else
        e = new Error("Test method throwing an exception");
      e.expected = true;
      throw e;
    }
  }
});

// Methods to help test applying methods with `wait: true`: delayedTrue
// returns true 500ms after being run unless makeDelayedTrueImmediatelyReturnFalse
// was run in the meanwhile
if (Meteor.is_server) {
  var delayed_true_future;
  var delayed_true_times;
  Meteor.methods({
    delayedTrue: function() {
      delayed_true_future = new Future();
      delayed_true_times = Meteor.setTimeout(function() {
        delayed_true_future['return'](true);
        delayed_true_future = null;
        delayed_true_times = null;
      }, 500);

      this.unblock();
      return delayed_true_future.wait();
    },
    makeDelayedTrueImmediatelyReturnFalse: function() {
      if (!delayed_true_future)
        return; // since delayedTrue's timeout had already run

      if (delayed_true_times) clearTimeout(delayed_true_times);
      delayed_true_future['return'](false);
      delayed_true_future = null;
      delayed_true_times = null;
    }
  });
}

/*****/

Ledger = new Meteor.Collection("ledger");

Meteor.startup(function () {
  if (Meteor.is_server)
    Ledger.remove({}); // XXX can this please be Ledger.remove()?
});

if (Meteor.is_server)
  Meteor.publish('ledger', function (world) {
    return Ledger.find({world: world}, {key: {collection: 'ledger',
                                              world: world}});
  });

Meteor.methods({
  'ledger/transfer': function (world, from_name, to_name, amount, cheat) {
    var from = Ledger.findOne({name: from_name, world: world});
    var to = Ledger.findOne({name: to_name, world: world});

    if (Meteor.is_server)
      cheat = false;

    if (!from)
      throw new Meteor.Error(404,
                             "No such account " + from_name + " in " + world);

    if (!to)
      throw new Meteor.Error(404,
                             "No such account " + to_name + " in " + world);

    if (from.balance < amount && !cheat)
      throw new Meteor.Error(409, "Insufficient funds");

    Ledger.update({_id: from._id}, {$inc: {balance: -amount}});
    Ledger.update({_id: to._id}, {$inc: {balance: amount}});
    Meteor.refresh({collection: 'ledger', world: world});
  }
});

/*****/

/// Helpers for "livedata - changing userid reruns subscriptions..."

objectsWithUsers = new Meteor.Collection("objectsWithUsers");

if (Meteor.is_server) {
  objectsWithUsers.remove({});
  objectsWithUsers.insert({name: "owned by none", ownerUserId: null});
  objectsWithUsers.insert({name: "owned by one - a", ownerUserId: 1});
  objectsWithUsers.insert({name: "owned by one - b", ownerUserId: 1});
  objectsWithUsers.insert({name: "owned by two - a", ownerUserId: 2});
  objectsWithUsers.insert({name: "owned by two - b", ownerUserId: 2});
  objectsWithUsers.insert({name: "owned by two - c", ownerUserId: 2});

  Meteor.publish("objectsWithUsers", function() {
    return objectsWithUsers.find({ownerUserId: this.userId()});
  });

  userIdWhenStopped = null;
  Meteor.publish("recordUserIdOnStop", function() {
    var self = this;
    self.onStop(function() {
      userIdWhenStopped = self.userId();
    });
  });

  Meteor.methods({
    setUserId: function(userId) {
      this.setUserId(userId);
    },
    userIdWhenStopped: function() {
      return userIdWhenStopped;
    }
  });
}

/*****/

/// Helper for "livedata - setUserId fails when called on server"

if (Meteor.is_server) {
  Meteor.startup(function() {
    errorThrownWhenCallingSetUserIdDirectlyOnServer = null;
    try {
      Meteor.call("setUserId", 1000);
    } catch (e) {
      errorThrownWhenCallingSetUserIdDirectlyOnServer = e;
    }
  });
}

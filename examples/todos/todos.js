// An implementation of the Auto-focus Time Management System
// 
// Original todo demo by [Jérôme Gravel-Niquet](http://jgn.me/). 
// This demo uses a simple 
// [LocalStorage adapter](backbone-localstorage.html)
// to persist Backbone models within your browser.

// Load the application once the DOM is ready, using `jQuery.ready`:
$(function(){

  // Todo Model
  // ----------

  // Our basic **Todo** model has `content`, `order`, and `done` attributes.
  window.Todo = Backbone.Model.extend({

    // If you don't provide a todo, one will be provided for you.
    EMPTY: "empty todo...",

    // Ensure that each todo created has `content`.
    initialize: function() {
      if (!this.get("content")) {
        this.set({"content": this.EMPTY});
      }
      if (!this.get("page")) {
        this.set({"page": 1});
      }
    },

    // Toggle the `open` state of this todo item.
    toggleOpen: function() {
      this.save({status: 'open'});
    },

    // Toggle the `open` state of this todo item.
    toggleDone: function() {
      this.save({status: 'done'});
    },

    // Toggle the `discarded` state of this todo item.
    toggleDiscarded: function() {
      this.save({status: 'discarded'});
    },

    // Remove this Todo from *localStorage* and delete its view.
    clear: function() {
      this.destroy();
      this.view.remove();
    }

  });

  // Todo Collection
  // ---------------

  // The collection of todos is backed by *localStorage* instead of a remote
  // server.
  window.TodoList = Backbone.Collection.extend({

    // Reference to this collection's model.
    model: Todo,

    // Save all of the todo items under the `"todos"` namespace.
    localStorage: new Store("todos"),

    // Filter down the list of all todo items that are finished.
    discarded: function() {
      return this.filter(function(todo){ return todo.get('status') == 'discarded'; });
    },

    // Filter down the list of all todo items that are finished.
    done: function() {
      return this.filter(function(todo){ return todo.get('status') == 'done'; });
    },

    // Filter down the list to only todo items that are still not finished.
    remaining: function() {
      return this.filter(function(todo){ return (todo.get('status') != 'done' && todo.get('status') != 'discarded'); });
    },

    // Returns the number of pages needed so far
    numPages: function () {
        return Math.ceil((Todos.length+1)/3);
    },

    // We keep the Todos in sequential order, despite being saved by unordered
    // GUID in the database. This generates the next order number for new items.
    nextOrder: function() {
      if (!this.length) return 1;
      return this.last().get('order') + 1;
    },

    // Todos are sorted by their original insertion order.
    comparator: function(todo) {
      return todo.get('order');
    }

  });

  // Create our global collection of **Todos**.
  window.Todos = new TodoList;

  // Todo Item View
  // --------------

  // The DOM element for a todo item...
  window.TodoView = Backbone.View.extend({

    //... is a list tag.
    tagName:  "li",

    // Cache the template function for a single item.
    template: _.template($('#item-template').html()),

    // The DOM events specific to an item.
    events: {
      "click .check"              : "toggleDone",
      "click span.todo-readd"     : "togglePartiallyDone",
      "click span.todo-discard"   : "toggleDiscarded",
      "dblclick div.todo-content" : "edit",
      "click span.todo-destroy"   : "clear",
      "keypress .todo-input"      : "updateOnEnter"
    },

    // The TodoView listens for changes to its model, re-rendering. Since there's
    // a one-to-one correspondence between a **Todo** and a **TodoView** in this
    // app, we set a direct reference on the model for convenience.
    initialize: function() {
      _.bindAll(this, 'render', 'close');
      this.model.bind('change', this.render);
      this.model.view = this;
    },

    // Re-render the contents of the todo item.
    render: function() {
      $(this.el).html(this.template(this.model.toJSON()));
      this.setContent();
      return this;
    },

    // To avoid XSS (not that it would be harmful in this particular app),
    // we use `jQuery.text` to set the contents of the todo item.
    setContent: function() {
      var content = this.model.get('content');
      var page = this.model.get('page');
      this.$('.todo-content').text(content + ' [' + page + ']');
      this.input = this.$('.todo-input');
      this.input.bind('blur', this.close);
      this.input.val(content);
    },

    checkPage: function(num) {
      if (this.model.get('page') != parseInt(num)) {
        $(this.el).hide();
      } else {
        $(this.el).show();
      }
    },

    // Toggle the `"discarded"` state of the model.
    toggleDiscarded: function() {
      this.model.toggleDiscarded();
    },

    // Toggle the `"done"` state of the model.
    toggleDone: function() {
      if (this.model.get('status') == 'done') {
        this.model.toggleOpen();
        return;
      } 
      if (this.model.get('status') == 'open') {
        this.model.toggleDone();
        return;
      } 
    },

    // TogglePartiallyDone the `"done"` state of the model.
    togglePartiallyDone: function() {
      // We re-append the item at the bottom of the list
      this.collection.create({
        content: this.model.get('content'),
        order:   Todos.nextOrder(),
        status:    'open'
      });
      // We toggle it's status
      this.model.toggleDone();
    },

    // Switch this view into `"editing"` mode, displaying the input field.
    edit: function() {
      $(this.el).addClass("editing");
      this.input.focus();
    },

    // Close the `"editing"` mode, saving changes to the todo.
    close: function() {
      this.model.save({content: this.input.val()});
      $(this.el).removeClass("editing");
    },

    // If you hit `enter`, we're through editing the item.
    updateOnEnter: function(e) {
      if (e.keyCode == 13) this.close();
    },

    // Remove this view from the DOM.
    remove: function() {
      $(this.el).remove();
    },

    // Remove the item, destroy the model.
    clear: function() {
      this.model.clear();
    }

  });

  // The Application
  // ---------------

  // Our overall **AppView** is the top-level piece of UI.
  window.AppView = Backbone.View.extend({

    // Instead of generating a new element, bind to the existing skeleton of
    // the App already present in the HTML.
    el: $("#todoapp"),

    // Our template for the line of statistics at the bottom of the app.
    statsTemplate: _.template($('#stats-template').html()),

    // Delegated events for creating new items, and clearing completed ones.
    events: {
      "keypress #new-todo":  "createOnEnter",
      "keyup #new-todo":     "showTooltip",
      "click .todo-clear a": "clearCompleted"
    },

    // At initialization we bind to the relevant events on the `Todos`
    // collection, when items are added or changed. Kick things off by
    // loading any preexisting todos that might be saved in *localStorage*.
    initialize: function() {
      _.bindAll(this, 'addOne', 'addAll', 'render');

      this.input    = this.$("#new-todo");
      this.currentPage    = 1;

      Todos.bind('add',     this.addOne);
      Todos.bind('refresh', this.addAll);
      Todos.bind('all',     this.render);

      Todos.fetch();
    },

    // Re-rendering the App just means refreshing the statistics -- the rest
    // of the app doesn't change.
    render: function() {
      var done = Todos.done().length;
      this.$('#todo-stats').html(this.statsTemplate({
        total:      Todos.length,
        done:       Todos.done().length,
        remaining:  Todos.remaining().length,
        discarded:  Todos.discarded().length,
        page:       this.currentPage + '/' + Todos.numPages()
      }));
    },

    // Add a single todo item to the list by creating a view for it, and
    // appending its element to the `<ul>`.
    addOne: function(todo) {
      var view = new TodoView({model: todo, collection: Todos});
      this.$("#todo-list").append(view.render().el);
    },

    // Add all items in the **Todos** collection at once.
    addAll: function() {
      Todos.each(this.addOne);
    },

    // Generate the attributes for a new Todo item.
    newAttributes: function() {
      return {
        content: this.input.val(),
        order:   Todos.nextOrder(),
        status:  'open',
        page:    Todos.numPages()
      };
    },

    // If you hit return in the main input field, create new **Todo** model,
    // persisting it to *localStorage*.
    createOnEnter: function(e) {
      if (e.keyCode != 13) return;
      Todos.create(this.newAttributes());
      this.input.val('');
    },

    // Clear all done todo items, destroying their models.
    clearCompleted: function() {
      _.each(Todos.done(), function(todo){ todo.clear(); });
      return false;
    },

    // Lazily show the tooltip that tells you to press `enter` to save
    // a new todo item, after one second.
    showTooltip: function(e) {
      var tooltip = this.$(".ui-tooltip-top");
      var val = this.input.val();
      tooltip.fadeOut();
      if (this.tooltipTimeout) clearTimeout(this.tooltipTimeout);
      if (val == '' || val == this.input.attr('placeholder')) return;
      var show = function(){ tooltip.show().fadeIn(); };
      this.tooltipTimeout = _.delay(show, 1000);
    }

  });

  // Finally, we kick things off by creating the **App**.
  window.App = new AppView;

  window.PageController = Backbone.Controller.extend({

    routes: {
      "p:num":        "pageNum",  // #p3
    },

    pageNum: function(num) {
      App.currentPage = num;
      App.render();
      Todos.each(function(todo) {
        todo.view.checkPage(num);
      });
    }
  });

  window.Page = new PageController;

  Backbone.history.start();
});
